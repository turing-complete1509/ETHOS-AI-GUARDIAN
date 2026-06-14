import pandas as pd
import numpy as np
from antibias_engine import AntiBiasPipeline, ReweightingModule, BiasScanner

def run_verification():
    # 1. Create a biased dataset where a feature is correlated with sensitive attribute
    np.random.seed(42)
    n = 2000
    sensitive = np.random.binomial(1, 0.5, n) 
    
    # Feature 1: Fair
    f1 = np.random.normal(0, 1, n)
    
    # Feature 2: Proxy for sensitive attribute
    # In majority group (1), f2 is higher
    f2 = 2 * sensitive + np.random.normal(0, 1, n)
    
    # Target Y: Depends on f1 and f2
    # Since f2 is correlated with sensitive, the model will learn to discriminate if it uses f2
    logit = f1 + f2 - 1
    prob = 1 / (1 + np.exp(-logit))
    y = (np.random.rand(n) < prob).astype(int)
    
    df = pd.DataFrame({'sensitive': sensitive, 'f1': f1, 'f2': f2, 'target': y})
    
    pipeline = AntiBiasPipeline()
    scanner = BiasScanner()
    
    print("=== Verification Start (Proxy Bias) ===")
    print(f"Group Distribution: {df['sensitive'].value_counts(normalize=True).to_dict()}")
    print(f"Label Distribution: {df.groupby('sensitive')['target'].mean().to_dict()}")
    
    features = ['f1', 'f2']
    
    # --- Baseline ---
    print("\n[1] Training Baseline (Using Proxy Feature)...")
    baseline = pipeline.train_and_evaluate(df, features, 'sensitive', 'target')
    print(f"Baseline Accuracy: {baseline['accuracy']:.4f}")
    print(f"Baseline Fairness: {baseline['fairness_metrics']}")
    
    # --- Mitigation: Reweighting ---
    print("\n[2] Applying Reweighting Mitigation...")
    weights = ReweightingModule.compute_weights(df, 'sensitive', 'target')
    
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    
    scaler = StandardScaler()
    X = scaler.fit_transform(df[features])
    
    model_weighted = LogisticRegression()
    model_weighted.fit(X, df['target'], sample_weight=weights)
    y_pred_weighted = model_weighted.predict(X)
    
    df_eval_w = df.copy()
    df_eval_w['y_pred'] = y_pred_weighted
    metrics_w = scanner.compute_metrics(df_eval_w, 'sensitive', 'target', y_pred_col='y_pred')
    
    print(f"Reweighted Accuracy: {model_weighted.score(X, df['target']):.4f}")
    print(f"Reweighted Fairness: {metrics_w}")
    
    # --- Mitigation: Adversarial ---
    print("\n[3] Applying Adversarial Mitigation (500 epochs)...")
    adversarial = pipeline.mitigate_adversarial(df, features, 'sensitive', 'target', epochs=500)
    print(f"Adversarial Accuracy: {adversarial['accuracy']:.4f}")
    print(f"Adversarial Fairness: {adversarial['fairness_metrics']}")

if __name__ == "__main__":
    run_verification()
