import pandas as pd
from sklearn.impute import KNNImputer

def apply_knn_imputation(df):
    """
    Applies K-Nearest Neighbors (KNN) imputation.
    """
    print("Generating KNN Imputed Dataset...")
    imputer = KNNImputer(n_neighbors=5, weights='uniform')
    df_imputed = pd.DataFrame(imputer.fit_transform(df), columns=df.columns)
    return df_imputed
