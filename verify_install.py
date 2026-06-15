import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from ethos_guardian import (
    drop_id_columns,
    apply_knn_imputation,
    AntiBiasPipeline,
    FairnessStressTester
)

def main():
    print("=== Ethos Guardian Package Verification ===")
    
    # 1. Test ID column dropping logic
    print("\n1. Testing ID column dropping...")
    df = pd.DataFrame({
        "candidate_id": ["C1", "C2", "C3", "C4"],
        "age": [25, 30, np.nan, 40],
        "gender": [1, 0, 1, 0],
        "hired": [1, 0, 1, 0]
    })
    print("Original columns:", list(df.columns))
    df_clean = drop_id_columns(df)
    print("Cleaned columns:", list(df_clean.columns))
    assert "candidate_id" not in df_clean.columns, "Failed to drop ID column"
    print("ID dropping: PASSED")
    
    # 2. Test Tabular Imputation
    print("\n2. Testing Tabular Imputation...")
    df_imputed = apply_knn_imputation(df_clean, n_neighbors=2)
    print("Imputed dataframe:\n", df_imputed)
    assert not df_imputed.isnull().any().any(), "Imputation left NaN values"
    print("Imputation: PASSED")
    
    # 3. Test Causal/Bias Auditing Pipeline
    print("\n3. Testing AntiBiasPipeline...")
    pipeline = AntiBiasPipeline(model_type='logistic')
    results = pipeline.train_and_evaluate(
        df=df_imputed,
        features=["age"],
        sensitive_attr="gender",
        target_col="hired",
        dataset_description="Recruitment hiring dataset"
    )
    print("Accuracy:", results["accuracy"])
    print("Fairness metrics:", results["fairness_metrics"])
    print("Audit analysis:", results["analysis"])
    print("Semantic proxy analysis:", results["contextual_analysis"])
    print("AntiBiasPipeline: PASSED")
    
    # 4. Test FairnessStressTester
    print("\n4. Testing FairnessStressTester...")
    # Train a simple model for stress tester input
    X = df_imputed[["age"]]
    y = df_imputed["hired"]
    model = LogisticRegression().fit(X, y)
    
    stress_tester = FairnessStressTester(
        model=model,
        features=["age"],
        sensitive_attr="gender",
        target_col="hired",
        privileged_group=1.0,
        unprivileged_group=0.0
    )
    stress_results = stress_tester.run_stress_test(df_imputed, steps=5)
    print("Stress scan results (sample ratios):")
    for res in stress_results:
        print(f"  Ratio: {res['unprivileged_ratio']:.2f} -> Accuracy: {res['accuracy']:.2f}, Disparate Impact: {res['disparate_impact']:.4f}")
        
    collapse_info = stress_tester.find_collapse_point(stress_results)
    print("Collapse info:", collapse_info)
    assert "is_robust" in collapse_info
    print("FairnessStressTester: PASSED")
    
    print("\n=== Verification Completed Successfully! ===")

if __name__ == "__main__":
    main()
