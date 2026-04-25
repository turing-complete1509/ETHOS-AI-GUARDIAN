import pandas as pd
from sklearn.impute import SimpleImputer

def apply_mean_mode_imputation(df):
    """
    Applies Mean/Mode imputation to the dataset.
    """
    print("Generating Mean/Mode Imputed Dataset...")
    imputer = SimpleImputer(strategy='mean')
    df_imputed = pd.DataFrame(imputer.fit_transform(df), columns=df.columns)
    return df_imputed
