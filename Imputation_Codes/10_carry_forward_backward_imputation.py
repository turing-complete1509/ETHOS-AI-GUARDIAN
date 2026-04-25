# No pandas import needed

def apply_carry_forward_backward_imputation(df):
    """
    Applies Carry Forward (ffill) and Carry Backward (bfill) Imputation.
    """
    print("Running Carry Forward Carry Backward Imputation...")
    df_imputed = df.copy().ffill().bfill()
    df_imputed.fillna(0, inplace=True)
    return df_imputed
