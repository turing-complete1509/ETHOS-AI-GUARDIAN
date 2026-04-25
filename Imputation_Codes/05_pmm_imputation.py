import pandas as pd
import numpy as np
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.linear_model import LinearRegression
from sklearn.neighbors import NearestNeighbors
from sklearn.base import BaseEstimator, RegressorMixin

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

def apply_pmm_imputation(df):
    """
    Applies Predictive Mean Matching (PMM) Imputation.
    """
    print("Running Predictive Mean Matching (PMM) Imputation...")
    imputer = IterativeImputer(estimator=PMMRegressor(), max_iter=10, random_state=42)
    df_imputed = pd.DataFrame(imputer.fit_transform(df), columns=df.columns)
    return df_imputed
