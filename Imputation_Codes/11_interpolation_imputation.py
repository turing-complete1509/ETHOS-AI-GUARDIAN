# No pandas import needed

def apply_interpolation_imputation(df):
    """
    Applies Linear Interpolation Imputation.
    """
    print("Running Interpolation Imputation...")
    df_imputed = df.copy().interpolate(method='linear').ffill().bfill()
    df_imputed.fillna(0, inplace=True)
    return df_imputed
