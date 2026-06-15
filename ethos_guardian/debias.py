import os
import re
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
import google.generativeai as genai
from .utils import drop_id_columns

class BiasScanner:
    """Scanner for detecting fairness metrics in datasets and model predictions."""
    
    @staticmethod
    def compute_metrics(df, sensitive_attr, target_col, y_pred_col=None, privileged_group=1, unprivileged_group=0):
        """
        Computes core fairness metrics.
        """
        results = {}
        label_col = y_pred_col if y_pred_col else target_col
        
        # Calculate rates
        prob_privileged = df[df[sensitive_attr] == privileged_group][label_col].mean()
        prob_unprivileged = df[df[sensitive_attr] == unprivileged_group][label_col].mean()
        
        results["statistical_parity_difference"] = round(float(prob_unprivileged - prob_privileged), 4)
        results["disparate_impact"] = round(float(prob_unprivileged / prob_privileged), 4) if prob_privileged > 0 else 0.0
        
        # Performance parity
        if y_pred_col:
            tpr_priv = df[(df[sensitive_attr] == privileged_group) & (df[target_col] == 1)][y_pred_col].mean()
            tpr_unpriv = df[(df[sensitive_attr] == unprivileged_group) & (df[target_col] == 1)][y_pred_col].mean()
            
            fpr_priv = df[(df[sensitive_attr] == privileged_group) & (df[target_col] == 0)][y_pred_col].mean()
            fpr_unpriv = df[(df[sensitive_attr] == unprivileged_group) & (df[target_col] == 0)][y_pred_col].mean()
            
            tpr_priv = tpr_priv if not np.isnan(tpr_priv) else 0.0
            tpr_unpriv = tpr_unpriv if not np.isnan(tpr_unpriv) else 0.0
            fpr_priv = fpr_priv if not np.isnan(fpr_priv) else 0.0
            fpr_unpriv = fpr_unpriv if not np.isnan(fpr_unpriv) else 0.0

            results["equal_opportunity_difference"] = round(float(tpr_unpriv - tpr_priv), 4)
            results["average_odds_difference"] = round(float(0.5 * ((fpr_unpriv - fpr_priv) + (tpr_unpriv - tpr_priv))), 4)
            
        return results

class BiasAnalyzer:
    """Analyzes the type of bias present based on data distributions."""
    
    @staticmethod
    def analyze_bias_type(df, sensitive_attr, target_col, features):
        analysis = []
        
        # 1. Selection Bias Check
        missing_by_group = df.isnull().groupby(df[sensitive_attr]).sum().sum(axis=1)
        if missing_by_group.std() > 0.1 * missing_by_group.mean():
            analysis.append(
                f"High risk of Selection Bias: Missing data varies significantly across demographics (Std: {round(missing_by_group.std(), 2)}, Mean: {round(missing_by_group.mean(), 2)})."
            )
            
        # 2. Confounding Bias Check
        correlations = df[features + [sensitive_attr]].corr()[sensitive_attr].abs().sort_values(ascending=False)
        top_confounders = correlations[1:4] 
        high_corr_feats = top_confounders[top_confounders > 0.3]
        if not high_corr_feats.empty:
            analysis.append(
                f"Potential Confounding Bias: Features {list(high_corr_feats.index)} have strong correlations (>{0.3}) with {sensitive_attr}. The model may learn to use these features as proxies."
            )
            
        # 3. Label Bias Check
        label_dist = df.groupby(sensitive_attr)[target_col].mean()
        if label_dist.std() > 0.2:
            gap = round(label_dist.max() - label_dist.min(), 3)
            analysis.append(
                f"Historical Label Bias: Ground truth labels are skewed by a margin of {gap} across {sensitive_attr} groups."
            )
            
        if not analysis:
            analysis.append("No significant structural bias patterns detected.")
            
        return analysis

class ReweightingModule:
    """Implements Targeted Importance Weighting (TIW)."""
    
    @staticmethod
    def compute_weights(df, sensitive_attr, target_col):
        n = len(df)
        weights = np.ones(n)
        
        groups = df[sensitive_attr].unique()
        labels = df[target_col].unique()
        
        for g in groups:
            for l in labels:
                p_g = len(df[df[sensitive_attr] == g]) / n
                p_l = len(df[df[target_col] == l]) / n
                p_gl = len(df[(df[sensitive_attr] == g) & (df[target_col] == l)]) / n
                
                if p_gl > 0:
                    w = (p_g * p_l) / p_gl
                    mask = (df[sensitive_attr] == g) & (df[target_col] == l)
                    weights[mask] = w
        
        return weights

class TabTransformerBlock(nn.Module):
    def __init__(self, d_model, nhead, dim_feedforward=128, dropout=0.1):
        super().__init__()
        self.self_attn = nn.MultiheadAttention(d_model, nhead, dropout=dropout, batch_first=True)
        self.linear1 = nn.Linear(d_model, dim_feedforward)
        self.dropout = nn.Dropout(dropout)
        self.linear2 = nn.Linear(dim_feedforward, d_model)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout1 = nn.Dropout(dropout)
        self.dropout2 = nn.Dropout(dropout)
        self.activation = nn.GELU()

    def forward(self, x):
        attn_output, _ = self.self_attn(x, x, x)
        x = x + self.dropout1(attn_output)
        x = self.norm1(x)
        ff_output = self.linear2(self.dropout(self.activation(self.linear1(x))))
        x = x + self.dropout2(ff_output)
        x = self.norm2(x)
        return x

class ProTransformerDebiaser(nn.Module):
    def __init__(self, num_numeric, num_categorical, categories_per_feat, embed_dim=32):
        super().__init__()
        self.embed_dim = embed_dim
        self.embeddings = nn.ModuleList([
            nn.Embedding(num_cats, embed_dim) for num_cats in categories_per_feat
        ])
        self.num_projection = nn.Linear(num_numeric, embed_dim) if num_numeric > 0 else None
        self.transformer_layer = TabTransformerBlock(d_model=embed_dim, nhead=4)
        self.fair_bottleneck = nn.Sequential(
            nn.Linear(embed_dim, 16),
            nn.GELU(),
            nn.LayerNorm(16)
        )
        self.task_head = nn.Sequential(
            nn.Linear(16, 1),
            nn.Sigmoid()
        )
        self.adversary = nn.Sequential(
            nn.Linear(16, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid()
        )

    def forward(self, x_num, x_cat):
        cat_embeds = []
        for i, emb in enumerate(self.embeddings):
            cat_embeds.append(emb(x_cat[:, i]).unsqueeze(1))
            
        tokens = torch.cat(cat_embeds, dim=1) if cat_embeds else torch.zeros((x_cat.shape[0], 0, self.embed_dim), device=x_cat.device)
        
        if self.num_projection:
            num_token = self.num_projection(x_num).unsqueeze(1)
            tokens = torch.cat([tokens, num_token], dim=1)
            
        contextual_tokens = self.transformer_layer(tokens)
        latent = torch.mean(contextual_tokens, dim=1)
        latent_fair = self.fair_bottleneck(latent)
        
        y_pred = self.task_head(latent_fair)
        s_pred = self.adversary(latent_fair)
        
        return y_pred, s_pred, latent_fair

class AdversarialDebiaser(nn.Module):
    def __init__(self, input_dim):
        super().__init__()
        self.predictor = nn.Sequential(
            nn.Linear(input_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        self.adversary = nn.Sequential(
            nn.Linear(1, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid()
        )
        
    def forward(self, x):
        y_pred = self.predictor(x)
        s_pred = self.adversary(y_pred)
        return y_pred, s_pred

class SemanticAnalyzer:
    """Uses the Gemini API to scan features and explain proxy variables contextually."""
    
    @staticmethod
    def detect_contextual_proxies(df, features, sensitive_attr, dataset_description=None):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return "Gemini API key (GEMINI_API_KEY) not found in environment variables. Contextual proxy detection skipped."
            
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.5-flash")
            
            # Compute correlations as statistical context
            # Convert categorical cols to label values for correlation calculation
            df_corr = df.copy()
            for col in [sensitive_attr] + list(features):
                if not pd.api.types.is_numeric_dtype(df_corr[col]):
                    df_corr[col] = LabelEncoder().fit_transform(df_corr[col].astype(str))
            
            correlations = df_corr[features].corrwith(df_corr[sensitive_attr]).abs().sort_values(ascending=False)
            top_corr = correlations.head(5).to_dict()
            
            prompt = f"""
            You are a senior AI Safety and Fairness Auditor. Analyze the dataset's features for potential 'proxy variables' of the protected sensitive column '{sensitive_attr}'.
            A proxy variable correlates strongly with a protected attribute, allowing a model to indirectly discriminate.
            
            DATASET DESCRIPTION:
            "{dataset_description or 'Recruitment or socio-demographic tracking dataset.'}"
            
            FEATURES:
            {list(features)}
            
            TOP STATISTICAL CORRELATIONS WITH '{sensitive_attr}':
            {top_corr}
            
            TASK:
            Provide a short, professional analysis (max 150 words) identifying any potential proxy features and recommend mitigation options. Format with a clear Markdown bullet list.
            """
            
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error executing semantic proxy analysis via Gemini API: {str(e)}"

class AntiBiasPipeline:
    """Unified pipeline for automated bias detection, mitigation, and semantic audit."""
    
    def __init__(self, model_type='logistic'):
        self.model_type = model_type
        self.scanner = BiasScanner()
        self.analyzer = BiasAnalyzer()
        self.scaler = StandardScaler()
        
    def _prepare_data(self, df, features, sensitive_attr, target_col):
        # Fit scale numeric columns
        X = self.scaler.fit_transform(df[features])
        y = df[target_col].values
        s = df[sensitive_attr].values
        return X, y, s

    def train_and_evaluate(self, df, features, sensitive_attr, target_col, dataset_description=None):
        """
        Filters ID columns, trains model, computes metrics, and executes semantic audit.
        """
        # Auto-drop ID and primary key columns
        df_clean = drop_id_columns(df)
        cleaned_features = [f for f in features if f in df_clean.columns]
        
        # Label encode targets if object
        if df_clean[target_col].dtype == 'object':
            le = LabelEncoder()
            df_clean[target_col] = le.fit_transform(df_clean[target_col].astype(str))
            
        # Label encode sensitive attr if object
        if df_clean[sensitive_attr].dtype == 'object':
            le_s = LabelEncoder()
            df_clean[sensitive_attr] = le_s.fit_transform(df_clean[sensitive_attr].astype(str))
            
        # Label encode other categorical features
        for f in cleaned_features:
            if df_clean[f].dtype == 'object':
                df_clean[f] = LabelEncoder().fit_transform(df_clean[f].astype(str))
                
        X, y, s = self._prepare_data(df_clean, cleaned_features, sensitive_attr, target_col)
        
        # Baseline model training
        model = LogisticRegression(max_iter=1000)
        model.fit(X, y)
        y_pred = model.predict(X)
        
        eval_df = df_clean.copy()
        eval_df['y_pred'] = y_pred
        
        # Compute rates on groups
        groups = df_clean[sensitive_attr].unique()
        priv_group = 1 if 1 in groups else (groups[1] if len(groups) > 1 else groups[0])
        unpriv_group = 0 if 0 in groups else groups[0]
        
        metrics = self.scanner.compute_metrics(
            eval_df, sensitive_attr, target_col, 
            y_pred_col='y_pred', 
            privileged_group=priv_group, 
            unprivileged_group=unpriv_group
        )
        
        analysis = self.analyzer.analyze_bias_type(df_clean, sensitive_attr, target_col, cleaned_features)
        
        # Gemini context-aware semantic analysis
        semantic_audit = SemanticAnalyzer.detect_contextual_proxies(
            df_clean, cleaned_features, sensitive_attr, 
            dataset_description=dataset_description
        )
        
        return {
            "accuracy": accuracy_score(y, y_pred),
            "fairness_metrics": metrics,
            "analysis": analysis,
            "contextual_analysis": semantic_audit
        }
