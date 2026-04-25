import pandas as pd
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.ensemble import RandomForestRegressor

def apply_random_forest_imputation(df):
    """
    Applies Multiple Random Forest Imputation.
    """
    print("Running Multiple Random Forest Imputation...")
    imputer = IterativeImputer(
        estimator=RandomForestRegressor(n_estimators=10, random_state=42), 
        max_iter=10, 
        random_state=42
    )
    df_imputed = pd.DataFrame(imputer.fit_transform(df), columns=df.columns)
    return df_imputed
