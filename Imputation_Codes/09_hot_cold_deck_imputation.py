# No pandas import needed
import numpy as np

def apply_grouped_hot_deck(df, group_col):
    df_imputed = df.copy()
    for col in df.columns:
        if col == group_col:
            continue
        for group in df[group_col].unique():
            group_data = df[df[group_col] == group]
            observed = group_data[col].dropna()
            if len(observed) > 0:
                mask = (df[group_col] == group) & (df[col].isnull())
                df_imputed.loc[mask, col] = np.random.choice(
                    observed, size=mask.sum()
                )
    return df_imputed
