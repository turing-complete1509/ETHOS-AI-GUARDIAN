import pandas as pd
import numpy as np
from .debias import BiasScanner

class FairnessStressTester:
    """Simulates demographic covariate shifts and computes model robustness margins under stress."""
    
    def __init__(self, model, features, sensitive_attr, target_col, privileged_group=1, unprivileged_group=0):
        self.model = model
        self.features = features
        self.sensitive_attr = sensitive_attr
        self.target_col = target_col
        self.privileged_group = privileged_group
        self.unprivileged_group = unprivileged_group
        
    def simulate_demographic_shift(self, df: pd.DataFrame, unprivileged_ratio: float, random_state: int = 42) -> pd.DataFrame:
        """
        Creates a synthetic dataset by bootstrap-resampling the unprivileged and privileged groups
        to achieve a targeted ratio of the unprivileged group.
        """
        df_unpriv = df[df[self.sensitive_attr] == self.unprivileged_group]
        df_priv = df[df[self.sensitive_attr] == self.privileged_group]
        
        if len(df_unpriv) == 0 or len(df_priv) == 0:
            return df.copy()
            
        n_total = len(df)
        n_unpriv = int(n_total * unprivileged_ratio)
        n_priv = n_total - n_unpriv
        
        # Bootstrap sample
        np.random.seed(random_state)
        idx_unpriv = np.random.choice(df_unpriv.index, size=max(1, n_unpriv), replace=True)
        idx_priv = np.random.choice(df_priv.index, size=max(1, n_priv), replace=True)
        
        df_shifted = pd.concat([df.loc[idx_unpriv], df.loc[idx_priv]]).reset_index(drop=True)
        return df_shifted

    def run_stress_test(self, df: pd.DataFrame, steps: int = 19) -> list:
        """
        Scans unprivileged group ratios from 5% to 95% and computes accuracy and fairness metrics.
        """
        ratios = np.linspace(0.05, 0.95, steps)
        results = []
        
        for r in ratios:
            df_shifted = self.simulate_demographic_shift(df, r)
            if len(df_shifted) == 0:
                continue
                
            X = df_shifted[self.features]
            y_true = df_shifted[self.target_col].values
            
            try:
                # Predict
                y_pred = self.model.predict(X)
            except Exception:
                # If prediction fails (e.g. requires 2D arrays, etc.), attempt converting X to numpy
                try:
                    y_pred = self.model.predict(X.values)
                except Exception:
                    continue
                
            accuracy = float(np.mean(y_true == y_pred))
            
            # Compute fairness metrics on predictions
            df_shifted['y_pred'] = y_pred
            metrics = BiasScanner.compute_metrics(
                df_shifted, self.sensitive_attr, self.target_col, y_pred_col='y_pred',
                privileged_group=self.privileged_group, unprivileged_group=self.unprivileged_group
            )
            
            results.append({
                "unprivileged_ratio": float(r),
                "accuracy": accuracy,
                "statistical_parity_difference": metrics["statistical_parity_difference"],
                "disparate_impact": metrics["disparate_impact"]
            })
            
        return results

    def find_collapse_point(self, stress_results: list) -> dict:
        """
        Finds the first unprivileged ratio where the Disparate Impact falls outside of [0.8, 1.25].
        """
        collapse_points = []
        for res in stress_results:
            di = res["disparate_impact"]
            if di < 0.8 or di > 1.25:
                collapse_points.append(res["unprivileged_ratio"])
                
        safe_ratios = [res["unprivileged_ratio"] for res in stress_results if 0.8 <= res["disparate_impact"] <= 1.25]
        
        if collapse_points:
            return {
                "is_robust": False,
                "collapse_ratios": collapse_points,
                "safe_range": [min(safe_ratios), max(safe_ratios)] if safe_ratios else [None, None]
            }
        return {
            "is_robust": True,
            "collapse_ratios": [],
            "safe_range": [0.05, 0.95]
        }
