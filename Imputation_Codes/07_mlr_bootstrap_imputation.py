import pandas as pd
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.linear_model import BayesianRidge

import numpy as np

def apply_bootstrap_imputation(df, n_bootstrap=5):
    imputed_datasets = []

    for i in range(n_bootstrap):
        df_sample = df.sample(frac=1, replace=True, random_state=42+i)
        imputer = IterativeImputer(
            estimator=BayesianRidge(),
            max_iter=10,
            random_state=42+i
        )
        imputed = pd.DataFrame(
            imputer.fit_transform(df_sample),
            columns=df.columns
        )
        imputed_datasets.append(imputed)

    return imputed_datasets
