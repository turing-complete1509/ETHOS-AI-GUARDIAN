import pytest
import pandas as pd
import numpy as np
from ethos_guardian import (
    is_id_or_pk_column,
    drop_id_columns,
    apply_mean_mode_imputation,
    apply_knn_imputation,
    apply_mice_imputation,
    apply_carry_forward_backward_imputation,
    BiasScanner,
    BiasAnalyzer,
    ReweightingModule,
    AntiBiasPipeline
)

def test_id_detection():
    # Test column detection
    assert is_id_or_pk_column("candidate_id", pd.Series([1, 2, 3]))
    assert is_id_or_pk_column("name", pd.Series(["A", "B", "C"]))
    assert not is_id_or_pk_column("age", pd.Series([25, 30, 35]))
    
    # Test dataframe dropping
    df = pd.DataFrame({
        "candidate_id": [1, 2, 3],
        "age": [20, 30, 40],
        "applicant_name": ["Alice", "Bob", "Charlie"]
    })
    df_clean = drop_id_columns(df, verbose=False)
    assert "candidate_id" not in df_clean.columns
    assert "applicant_name" not in df_clean.columns
    assert "age" in df_clean.columns

def test_imputations():
    df = pd.DataFrame({
        "A": [1.0, np.nan, 3.0, 4.0],
        "B": ["cat", "dog", np.nan, "cat"]
    })
    
    # Mean/Mode
    res_mm = apply_mean_mode_imputation(df)
    assert not res_mm.isnull().any().any()
    assert res_mm.loc[1, "A"] == pytest.approx(2.666, abs=0.1) # mean of [1, 3, 4]
    assert res_mm.loc[2, "B"] == "cat" # mode of B
    
    # KNN
    res_knn = apply_knn_imputation(df, n_neighbors=2)
    assert not res_knn.isnull().any().any()
    
    # Carry Forward/Backward
    res_cf = apply_carry_forward_backward_imputation(df)
    assert not res_cf.isnull().any().any()

def test_bias_metrics():
    df = pd.DataFrame({
        "gender": [1, 1, 0, 0, 1, 0],
        "hired": [1, 1, 0, 1, 0, 0]
    })
    # privileged_group=1, unprivileged_group=0
    metrics = BiasScanner.compute_metrics(
        df=df,
        sensitive_attr="gender",
        target_col="hired",
        privileged_group=1,
        unprivileged_group=0
    )
    assert "statistical_parity_difference" in metrics
    assert "disparate_impact" in metrics

def test_reweighting():
    df = pd.DataFrame({
        "gender": [1, 1, 0, 0],
        "hired": [1, 0, 1, 0]
    })
    weights = ReweightingModule.compute_weights(df, "gender", "hired")
    assert len(weights) == 4
    assert np.all(weights > 0)

def test_stress_tester():
    from sklearn.linear_model import LogisticRegression
    from ethos_guardian import FairnessStressTester
    
    df = pd.DataFrame({
        "gender": [1, 1, 1, 1, 0, 0, 0, 0],
        "age": [20, 22, 25, 27, 30, 32, 35, 40],
        "hired": [1, 1, 0, 1, 0, 0, 1, 0]
    })
    
    model = LogisticRegression().fit(df[["age"]], df["hired"])
    
    tester = FairnessStressTester(
        model=model,
        features=["age"],
        sensitive_attr="gender",
        target_col="hired"
    )
    
    stress_res = tester.run_stress_test(df, steps=3)
    assert len(stress_res) == 3
    for res in stress_res:
        assert "unprivileged_ratio" in res
        assert "disparate_impact" in res
        
    collapse_info = tester.find_collapse_point(stress_res)
    assert "is_robust" in collapse_info

