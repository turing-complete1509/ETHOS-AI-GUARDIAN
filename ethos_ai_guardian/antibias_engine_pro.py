import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler

class BiasScanner:
    @staticmethod
    def compute_metrics(df, sensitive_attr, target_col, y_pred_col=None, privileged_group=1, unprivileged_group=0):
        results = {}
        label_col = y_pred_col if y_pred_col else target_col
        prob_privileged = df[df[sensitive_attr] == privileged_group][label_col].mean()
        prob_unprivileged = df[df[sensitive_attr] == unprivileged_group][label_col].mean()
        results["statistical_parity_difference"] = round(float(prob_unprivileged - prob_privileged), 4)
        results["disparate_impact"] = round(float(prob_unprivileged / prob_privileged), 4) if prob_privileged > 0 else 0
        return results

class ProAdversarialDebiaser(nn.Module):
    def __init__(self, input_dim):
        super().__init__()
        self.predictor = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.LeakyReLU(),
            nn.Linear(64, 32),
            nn.LeakyReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        self.adversary = nn.Sequential(
            nn.Linear(1, 32),
            nn.LeakyReLU(),
            nn.Linear(32, 32),
            nn.LeakyReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
    def forward(self, x):
        y_pred = self.predictor(x)
        s_pred = self.adversary(y_pred)
        return y_pred, s_pred

class AntiBiasEnginePro:
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = None
        
    def train_ultimate_fairness(self, df, features, sensitive_attr, target_col):
        X_raw = self.scaler.fit_transform(df[features])
        y_t = torch.FloatTensor(df[target_col].values).view(-1, 1)
        s_t = torch.FloatTensor(df[sensitive_attr].values).view(-1, 1)
        X_t = torch.FloatTensor(X_raw)
        
        self.model = ProAdversarialDebiaser(X_raw.shape[1])
        optimizer_p = optim.Adam(self.model.predictor.parameters(), lr=0.005)
        optimizer_a = optim.Adam(self.model.adversary.parameters(), lr=0.01)
        criterion = nn.BCELoss()
        
        for epoch in range(200):
            y_pred, s_pred = self.model(X_t)
            loss_a = criterion(s_pred, s_t)
            optimizer_a.zero_grad(); loss_a.backward(); optimizer_a.step()
            
            y_pred, s_pred = self.model(X_t)
            loss_y = criterion(y_pred, y_t)
            loss_s = criterion(s_pred, s_t)
            loss_total = loss_y - 1.5 * loss_s 
            optimizer_p.zero_grad(); loss_total.backward(); optimizer_p.step()

    def generate_debiased_dataset(self, df, features, output_path="debiased_dataset.csv"):
        """Generates a new CSV with corrected 'Fair Labels'."""
        if not self.model:
            raise ValueError("Model must be trained before generating debiased data.")
            
        X_raw = self.scaler.transform(df[features])
        X_t = torch.FloatTensor(X_raw)
        
        with torch.no_grad():
            fair_probs = self.model.predictor(X_t).numpy().flatten()
            # Convert probabilities to fair labels (0/1)
            fair_labels = (fair_probs > 0.5).astype(int)
            
        debiased_df = df.copy()
        debiased_df['original_target'] = df.iloc[:, -1] # Assuming last col was target
        debiased_df['fair_target'] = fair_labels
        
        # In a real 'Pro' scenario, we might also adjust the features themselves (Data Augmentation)
        # For now, we provide the 'Fair Ground Truth'
        debiased_df.to_csv(output_path, index=False)
        return output_path

if __name__ == "__main__":
    print("AntiBias Engine Pro: Debiased Data Generation Module Loaded.")
