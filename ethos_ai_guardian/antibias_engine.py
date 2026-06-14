import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split

class BiasScanner:
    """Scanner for detecting fairness metrics in datasets and model predictions."""
    
    @staticmethod
    def compute_metrics(df, sensitive_attr, target_col, y_pred_col=None, privileged_group=1, unprivileged_group=0):
        """
        Computes core fairness metrics.
        - Statistical Parity Difference: P(Y=1 | unprivileged) - P(Y=1 | privileged)
        - Disparate Impact: P(Y=1 | unprivileged) / P(Y=1 | privileged)
        - Equal Opportunity Difference: TPR_unprivileged - TPR_privileged (Requires y_pred_col)
        - Average Odds Difference: 0.5 * [(FPR_unprivileged - FPR_privileged) + (TPR_unprivileged - TPR_privileged)]
        """
        results = {}
        label_col = y_pred_col if y_pred_col else target_col
        
        # 1. Statistical Parity
        prob_privileged = df[df[sensitive_attr] == privileged_group][label_col].mean()
        prob_unprivileged = df[df[sensitive_attr] == unprivileged_group][label_col].mean()
        
        results["statistical_parity_difference"] = round(float(prob_unprivileged - prob_privileged), 4)
        results["disparate_impact"] = round(float(prob_unprivileged / prob_privileged), 4) if prob_privileged > 0 else 0
        
        # 2. Performance-based metrics
        if y_pred_col:
            # TPR = P(Y_pred=1 | Y=1)
            tpr_priv = df[(df[sensitive_attr] == privileged_group) & (df[target_col] == 1)][y_pred_col].mean()
            tpr_unpriv = df[(df[sensitive_attr] == unprivileged_group) & (df[target_col] == 1)][y_pred_col].mean()
            
            # FPR = P(Y_pred=1 | Y=0)
            fpr_priv = df[(df[sensitive_attr] == privileged_group) & (df[target_col] == 0)][y_pred_col].mean()
            fpr_unpriv = df[(df[sensitive_attr] == unprivileged_group) & (df[target_col] == 0)][y_pred_col].mean()
            
            # Handle NaNs if a group has no positive/negative labels
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
        
        # 1. Selection Bias Check (Missingness)
        missing_by_group = df.isnull().groupby(df[sensitive_attr]).sum().sum(axis=1)
        if missing_by_group.std() > 0.1 * missing_by_group.mean():
            std_val = round(missing_by_group.std(), 2)
            mean_val = round(missing_by_group.mean(), 2)
            analysis.append(f"High risk of Selection Bias: Missing data varies significantly across demographics (Std: {std_val}, Mean: {mean_val}). This suggests data collection artifacts that may exclude specific groups.")
            
        # 2. Confounding Bias Check
        correlations = df[features + [sensitive_attr]].corr()[sensitive_attr].abs().sort_values(ascending=False)
        top_confounders = correlations[1:4] 
        high_corr_feats = top_confounders[top_confounders > 0.3]
        if not high_corr_feats.empty:
            analysis.append(f"Potential Confounding Bias: Features {list(high_corr_feats.index)} have strong correlations (>{0.3}) with {sensitive_attr}. The model may learn to use these features as proxies for the sensitive attribute.")
            
        # 3. Label Bias Check
        label_dist = df.groupby(sensitive_attr)[target_col].mean()
        if label_dist.std() > 0.2:
            gap = round(label_dist.max() - label_dist.min(), 3)
            analysis.append(f"Historical Label Bias: Ground truth labels are skewed by a margin of {gap} across {sensitive_attr} groups. This indicates systemic bias in the historical decision-making process captured by the labels.")
            
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
    """Pro-level Transformer block for tabular data contextualization."""
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
        # Multi-head attention with residual connection
        attn_output, _ = self.self_attn(x, x, x)
        x = x + self.dropout1(attn_output)
        x = self.norm1(x)
        
        # Feed-forward with residual connection
        ff_output = self.linear2(self.dropout(self.activation(self.linear1(x))))
        x = x + self.dropout2(ff_output)
        x = self.norm2(x)
        return x

class ProTransformerDebiaser(nn.Module):
    """
    State-of-the-art Transformer-based debiaser.
    Uses categorical embeddings and multi-head attention to capture deep contextual bias.
    """
    def __init__(self, num_numeric, num_categorical, categories_per_feat, embed_dim=32):
        super().__init__()
        self.embed_dim = embed_dim
        
        # 1. Embedding layer for categorical features (meaning understanding)
        self.embeddings = nn.ModuleList([
            nn.Embedding(num_cats, embed_dim) for num_cats in categories_per_feat
        ])
        
        # 2. Projection for numeric features
        self.num_projection = nn.Linear(num_numeric, embed_dim) if num_numeric > 0 else None
        
        # 3. Transformer Encoder Blocks
        self.transformer_layer = TabTransformerBlock(d_model=embed_dim, nhead=4)
        
        # 4. Debias Projection Head (Fair Latent Space)
        self.fair_bottleneck = nn.Sequential(
            nn.Linear(embed_dim, 16),
            nn.GELU(),
            nn.LayerNorm(16)
        )
        
        # 5. Task Head (Prediction)
        self.task_head = nn.Sequential(
            nn.Linear(16, 1),
            nn.Sigmoid()
        )
        
        # 6. Adversary (Fairness Constraint)
        self.adversary = nn.Sequential(
            nn.Linear(16, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid()
        )

    def forward(self, x_num, x_cat):
        # x_cat: [batch, num_categorical]
        # x_num: [batch, num_numeric]
        
        # Embed categorical features
        cat_embeds = []
        for i, emb in enumerate(self.embeddings):
            cat_embeds.append(emb(x_cat[:, i]).unsqueeze(1)) # [batch, 1, embed_dim]
            
        # Combine all tokens
        tokens = torch.cat(cat_embeds, dim=1) # [batch, num_categorical, embed_dim]
        
        if self.num_projection:
            num_token = self.num_projection(x_num).unsqueeze(1)
            tokens = torch.cat([tokens, num_token], dim=1)
            
        # Contextualize via Transformer (Attention on relationships)
        contextual_tokens = self.transformer_layer(tokens)
        
        # Pool to latent representation (Fair Bottleneck)
        latent = torch.mean(contextual_tokens, dim=1)
        latent_fair = self.fair_bottleneck(latent)
        
        # Multi-task output
        y_pred = self.task_head(latent_fair)
        s_pred = self.adversary(latent_fair)
        
        return y_pred, s_pred, latent_fair

class AdversarialDebiaser(nn.Module):
    """Predictor-Adversary framework for in-processing debiasing."""
    
    def __init__(self, input_dim):
        super(AdversarialDebiaser, self).__init__()
        # Predictor: X -> Y
        self.predictor = nn.Sequential(
            nn.Linear(input_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        # Adversary: Y_pred -> S (sensitive attribute)
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

class AntiBiasPipeline:
    """Unified pipeline for automated bias detection and mitigation."""
    
    def __init__(self, model_type='logistic'):
        self.model_type = model_type
        self.scanner = BiasScanner()
        self.analyzer = BiasAnalyzer()
        self.scaler = StandardScaler()
        
    def _prepare_data(self, df, features, sensitive_attr, target_col):
        X = self.scaler.fit_transform(df[features])
        y = df[target_col].values
        s = df[sensitive_attr].values
        return X, y, s

    def train_and_evaluate(self, df, features, sensitive_attr, target_col):
        X, y, s = self._prepare_data(df, features, sensitive_attr, target_col)
        
        # Baseline Model
        model = LogisticRegression()
        model.fit(X, y)
        y_pred = model.predict(X)
        
        eval_df = df.copy()
        eval_df['y_pred'] = y_pred
        
        metrics = self.scanner.compute_metrics(eval_df, sensitive_attr, target_col, y_pred_col='y_pred')
        analysis = self.analyzer.analyze_bias_type(df, sensitive_attr, target_col, features)
        
        # New: Semantic Contextual Analysis
        semantic_audit = SemanticAnalyzer.detect_contextual_proxies(df, features, sensitive_attr)
        
        return {
            "accuracy": accuracy_score(y, y_pred),
            "fairness_metrics": metrics,
            "analysis": analysis,
            "contextual_analysis": semantic_audit
        }

    def mitigate_reweighting(self, df, features, sensitive_attr, target_col):
        """Pre-processing mitigation using reweighting."""
        weights = ReweightingModule.compute_weights(df, sensitive_attr, target_col)
        X, y, s = self._prepare_data(df, features, sensitive_attr, target_col)
        
        model = LogisticRegression()
        model.fit(X, y, sample_weight=weights)
        y_pred = model.predict(X)
        
        eval_df = df.copy()
        eval_df['y_pred'] = y_pred
        
        metrics = self.scanner.compute_metrics(eval_df, sensitive_attr, target_col, y_pred_col='y_pred')
        
        return {
            "accuracy": accuracy_score(y, y_pred),
            "fairness_metrics": metrics
        }

    def mitigate_transformer(self, df, features, sensitive_attr, target_col, epochs=30):
        """Pro-level Transformer mitigation with attention-based contextual debiasing."""
        # 1. Identify Categorical vs Numeric
        cat_features = [f for f in features if df[f].nunique() < 20]
        num_features = [f for f in features if f not in cat_features]
        
        # 2. Encode Categoricals for Embeddings
        encoders = {}
        cat_data = []
        categories_per_feat = []
        for col in cat_features:
            le = LabelEncoder()
            encoded = le.fit_transform(df[col].astype(str))
            cat_data.append(encoded)
            categories_per_feat.append(len(le.classes_))
            encoders[col] = le
            
        X_cat = np.stack(cat_data, axis=1) if cat_data else np.zeros((len(df), 0))
        X_num = self.scaler.fit_transform(df[num_features]) if num_features else np.zeros((len(df), 0))
        
        # 3. Tensors
        X_cat_t = torch.LongTensor(X_cat)
        X_num_t = torch.FloatTensor(X_num)
        y_t = torch.FloatTensor(df[target_col].values).view(-1, 1)
        s_t = torch.FloatTensor(df[sensitive_attr].values).view(-1, 1)
        
        # 4. Model & Optimizers
        model = ProTransformerDebiaser(
            num_numeric=len(num_features), 
            num_categorical=len(cat_features), 
            categories_per_feat=categories_per_feat
        )
        optimizer = optim.Adam(model.parameters(), lr=0.001)
        criterion = nn.BCELoss()
        
        # 5. Training Loop (Adversarial + Task)
        for epoch in range(epochs):
            y_pred, s_pred, latent = model(X_num_t, X_cat_t)
            
            loss_task = criterion(y_pred, y_t)
            loss_fair = criterion(s_pred, s_t)
            
            # Optimization: Minimize Task Loss, Maximize Fairness (Adversarial)
            # Alpha controls the Fairness-Accuracy tradeoff
            alpha = 0.5
            total_loss = loss_task - alpha * loss_fair
            
            optimizer.zero_grad()
            total_loss.backward()
            optimizer.step()
            
        # 6. Inference
        with torch.no_grad():
            y_pred_final, _, _ = model(X_num_t, X_cat_t)
            y_pred_bin = (y_pred_final > 0.5).numpy().astype(int)
            
        eval_df = df.copy()
        eval_df['y_pred'] = y_pred_bin
        
        metrics = self.scanner.compute_metrics(eval_df, sensitive_attr, target_col, y_pred_col='y_pred')
        
        return {
            "accuracy": accuracy_score(df[target_col], y_pred_bin),
            "fairness_metrics": metrics,
            "architecture": "Tabular Transformer with Multi-Head Attention",
            "latent_dim": 16
        }

if __name__ == "__main__":
    # Test block
    print("AntiBias Engine initialized. Use AntiBiasPipeline for automated mitigation.")
