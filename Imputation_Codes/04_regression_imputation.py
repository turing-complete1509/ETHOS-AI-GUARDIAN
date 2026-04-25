import pandas as pd
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.linear_model import LinearRegression

def apply_regression_imputation(df):
    """
    Applies Regression Imputation (Linear Regression).
    """
    print("Running Regression Imputation...")
    imputer = IterativeImputer(estimator=LinearRegression(), max_iter=10, random_state=42)
    df_imputed = pd.DataFrame(imputer.fit_transform(df), columns=df.columns)
    return df_imputed
