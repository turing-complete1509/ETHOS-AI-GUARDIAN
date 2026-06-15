import pandas as pd
import numpy as np
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.linear_model import LogisticRegression, BayesianRidge, LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.neighbors import NearestNeighbors
from sklearn.base import BaseEstimator, RegressorMixin

# Helper class for PMM
class PMMRegressor(BaseEstimator, RegressorMixin):
    def __init__(self):
        self.model = LinearRegression()
        self.nn = NearestNeighbors(n_neighbors=1)
        self.y_train = None
        
    def fit(self, X, y):
        self.model.fit(X, y)
        y_pred_train = self.model.predict(X).reshape(-1, 1)
        self.nn.fit(y_pred_train)
        self.y_train = y.values if isinstance(y, pd.Series) else y
        return self
        
    def predict(self, X):
        y_pred_test = self.model.predict(X).reshape(-1, 1)
        distances, indices = self.nn.kneighbors(y_pred_test)
        return self.y_train[indices.flatten()]

def apply_mean_mode_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """1. Mean/Mode Imputation"""
    df_imputed = df.copy()
    for col in df_imputed.columns:
        if pd.api.types.is_numeric_dtype(df_imputed[col]):
            imp = SimpleImputer(strategy='mean')
        else:
            imp = SimpleImputer(strategy='most_frequent')
        # Reshape to 2D for sklearn imputer
        vals = df_imputed[col].values.reshape(-1, 1)
        df_imputed[col] = imp.fit_transform(vals).flatten()
    return df_imputed

def apply_knn_imputation(df: pd.DataFrame, n_neighbors: int = 5) -> pd.DataFrame:
    """2. KNN Imputation"""
    # Enforce numeric encoding of categories for KNN distance metric if categorical exists
    df_encoded = df.copy()
    encoders = {}
    for col in df_encoded.columns:
        if not pd.api.types.is_numeric_dtype(df_encoded[col]):
            non_na = df_encoded[col].dropna()
            mapping = {val: idx for idx, val in enumerate(non_na.unique())}
            df_encoded[col] = df_encoded[col].map(mapping)
            encoders[col] = mapping

    imputer = KNNImputer(n_neighbors=n_neighbors, weights='uniform')
    imputed_arr = imputer.fit_transform(df_encoded)
    df_imputed = pd.DataFrame(imputed_arr, columns=df.columns)
    
    # Decode back categorical values
    for col, mapping in encoders.items():
        inv_map = {v: k for k, v in mapping.items()}
        df_imputed[col] = df_imputed[col].round().map(inv_map)
    return df_imputed

def apply_bayesian_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """3. Bayesian Imputation"""
    df_numeric = df.select_dtypes(include=[np.number])
    if df_numeric.empty:
         raise ValueError("Bayesian imputation requires at least one numeric column")
    imp = IterativeImputer(estimator=BayesianRidge(), max_iter=10, random_state=42)
    imputed_arr = imp.fit_transform(df_numeric)
    res_df = df.copy()
    res_df[df_numeric.columns] = imputed_arr
    # Fill remaining categoricals with mode
    return apply_mean_mode_imputation(res_df)

def apply_regression_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """4. Regression Imputation"""
    df_numeric = df.select_dtypes(include=[np.number])
    if df_numeric.empty:
         raise ValueError("Regression imputation requires at least one numeric column")
    imp = IterativeImputer(estimator=LinearRegression(), max_iter=10, random_state=42)
    imputed_arr = imp.fit_transform(df_numeric)
    res_df = df.copy()
    res_df[df_numeric.columns] = imputed_arr
    return apply_mean_mode_imputation(res_df)

def apply_pmm_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """5. Predictive Mean Matching (PMM) Imputation"""
    df_numeric = df.select_dtypes(include=[np.number])
    if df_numeric.empty:
         raise ValueError("PMM imputation requires at least one numeric column")
    imp = IterativeImputer(estimator=PMMRegressor(), max_iter=10, random_state=42)
    imputed_arr = imp.fit_transform(df_numeric)
    res_df = df.copy()
    res_df[df_numeric.columns] = imputed_arr
    return apply_mean_mode_imputation(res_df)

def apply_random_forest_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """6. Random Forest Imputation"""
    df_numeric = df.select_dtypes(include=[np.number])
    if df_numeric.empty:
         raise ValueError("Random Forest imputation requires at least one numeric column")
    imp = IterativeImputer(estimator=RandomForestRegressor(n_estimators=10, random_state=42), max_iter=10, random_state=42)
    imputed_arr = imp.fit_transform(df_numeric)
    res_df = df.copy()
    res_df[df_numeric.columns] = imputed_arr
    return apply_mean_mode_imputation(res_df)

def apply_mlr_bootstrap_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """7. Multiple Linear Regression with Bootstrap Imputation"""
    df_numeric = df.select_dtypes(include=[np.number])
    if df_numeric.empty:
         raise ValueError("MLR Bootstrap imputation requires at least one numeric column")
    imp = IterativeImputer(estimator=BayesianRidge(), sample_posterior=True, max_iter=10, random_state=42)
    imputed_arr = imp.fit_transform(df_numeric)
    res_df = df.copy()
    res_df[df_numeric.columns] = imputed_arr
    return apply_mean_mode_imputation(res_df)

def apply_mice_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """8. Multiple Imputation by Chained Equations (MICE)"""
    df_numeric = df.select_dtypes(include=[np.number])
    if df_numeric.empty:
         raise ValueError("MICE imputation requires at least one numeric column")
    imp = IterativeImputer(max_iter=10, random_state=42)
    imputed_arr = imp.fit_transform(df_numeric)
    res_df = df.copy()
    res_df[df_numeric.columns] = imputed_arr
    return apply_mean_mode_imputation(res_df)

def apply_hot_cold_deck_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """9. Hot/Cold Deck Imputation"""
    df_imputed = df.copy()
    np.random.seed(42)
    for col in df_imputed.columns:
        observed = df_imputed[col].dropna()
        if len(observed) > 0:
            missing = df_imputed[col].isnull()
            df_imputed.loc[missing, col] = np.random.choice(observed, size=missing.sum())
    return df_imputed

def apply_carry_forward_backward_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """10. Carry Forward and Carry Backward Imputation"""
    df_imputed = df.copy().ffill().bfill()
    df_imputed.fillna(0, inplace=True)
    return df_imputed

def apply_interpolation_imputation(df: pd.DataFrame) -> pd.DataFrame:
    """11. Interpolation Imputation"""
    df_imputed = df.copy().interpolate(method='linear').ffill().bfill()
    df_imputed.fillna(0, inplace=True)
    return df_imputed
