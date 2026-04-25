import pandas as pd
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
def apply_mice_imputation(df, n_imputations=5):
    imputed_datasets = []

    for i in range(n_imputations):
        imputer = IterativeImputer(
            max_iter=10,
            random_state=42 + i,
            sample_posterior=True   
        )
        imputed = pd.DataFrame(imputer.fit_transform(df), columns=df.columns)
        imputed_datasets.append(imputed)

    return imputed_datasets
