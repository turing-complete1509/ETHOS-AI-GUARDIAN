import pandas as pd
import numpy as np
import time
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import SimpleImputer, KNNImputer, IterativeImputer
from sklearn.linear_model import LogisticRegression, BayesianRidge, LinearRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.neighbors import NearestNeighbors
from sklearn.base import BaseEstimator, RegressorMixin

def print_section(title):
    print(f"\n{'='*50}\n{title}\n{'='*50}")

def main():
    start_time = time.time()
    print_section("Step 1: Dataset Acquisition")
    dataset_path = "els_02_12_byf3pststu_v1_0.csv"
    print(f"Loading dataset from {dataset_path}...")

    nces_columns = {
        'gender': 'BYSEX',
        'Race': 'BYRACE',
        'English': 'BYSTLANG',
        'Parents Education': 'BYPARED',
        'Family Income': 'BYINCOME',
        'Athletic level': 'F1ATHL',
        '9 12 GPA': 'F1RGPP2',
        'F1 Std Math': 'F1TXMSTD',
        'Std Math/Reading': 'BYTXCSTD',
        'School Urbanicity': 'BYURBAN',
        'School Control': 'BYCTRL',
        'Enrollment-administrator': 'BYENROLL',
        'Geographical Region': 'BYREGION',
        'Target': 'F3TZPS1' 
    }
    
    try:
        sample_df = pd.read_csv(dataset_path, nrows=5)
    except FileNotFoundError:
        print(f"ERROR: File {dataset_path} not found.")
        return

    available_cols = list(sample_df.columns)
    
    selected_cols = []
    
    for name, code in nces_columns.items():
        if code in available_cols:
            selected_cols.append(code)
    extra_cols = [c for c in available_cols if c.startswith(('BY', 'F1', 'F2'))][:20]
    final_cols = list(set(selected_cols + extra_cols))
    target_var = None
    for cand in ['F3TZPS1', 'F3ATTAINMENT', 'F3HDG', 'F3PS1BA', 'F3DEGREE']:
        if cand in available_cols:
            target_var = cand
            break
            
    if target_var is None:
        target_var = [c for c in available_cols if c.startswith('F3')][-1]
        print(f"Target variable exact match not found. Using {target_var} as proxy.")
    
    if target_var not in final_cols:
        final_cols.append(target_var)
        
    print(f"Reading full dataset with {len(final_cols)} variables...")
    missing_codes = [-9, -8, -7, -6, -5, -4, -3, -2, -1, -9.0, -8.0, -4.0]
    df = pd.read_csv(dataset_path, usecols=final_cols)
    df.replace(missing_codes, np.nan, inplace=True)
    
    print_section("Step 3: Replicate Data Cleaning EXACTLY as in PDF")
    initial_rows = len(df)
    
    median_target = df[target_var].median()
    df['Target_Binary'] = (df[target_var] > median_target).astype(int)
    df.loc[df[target_var].isna(), 'Target_Binary'] = np.nan
    df.drop(columns=[target_var], inplace=True)
    race_col = 'BYRACE' if 'BYRACE' in df.columns else None
    
    if race_col and 'Target_Binary' in df.columns:
        df = df.dropna(subset=['Target_Binary', race_col])
    elif 'Target_Binary' in df.columns:
        df = df.dropna(subset=['Target_Binary'])
    if race_col:
        df = df[df[race_col] != 1]
        df[race_col] = df[race_col].replace({5: 4})
        
    print(f"Rows dropped after sensitive/target cleaning: {initial_rows - len(df)}")
    print("Label Encoding categorical variables...")
    for col in df.columns:
        if df[col].dtype == 'object':
            le = LabelEncoder()
            mask = df[col].notna()
            df.loc[mask, col] = le.fit_transform(df.loc[mask, col].astype(str))
            
    print(f"Dataset shape after cleaning: {df.shape}")

    print_section("Step 4: Missing Data Analysis")
    total_missing = df.isna().sum().sum()
    print(f"Total missing values: {total_missing}")
    missing_per_feat = df.isna().sum()
    print("\nMissing values per feature (top 10):")
    print(missing_per_feat[missing_per_feat > 0].sort_values(ascending=False).head(10))
    
    if race_col:
        missing_by_race = df.isnull().groupby(df[race_col]).sum().sum(axis=1)
        print("\nMissing values per demographic group (Race):")
        print(missing_by_race)
        
        print("\nConceptual Analysis on Missingness Mechanisms (MCAR, MAR, MNAR):")
        print("As noted in the paper via Little's MCAR test (p=0.0), the data is highly unlikely to be MCAR.")
        print("Missingness correlates with sensitive attributes like Race, implying the missingness mechanism")
        print("is likely MAR (Missing At Random - depends on other variables) or MNAR (Missing Not At Random).")
        print("Therefore, removing cases with missing values (CCA) introduces systemic demographic biases.")

    df.dropna(axis=1, how='all', inplace=True)
    
    print_section("Step 5: Apply Imputation Methods")
    
    imputed_datasets = {}
    
    print("1. Generating Mean/Mode Imputed Dataset...")  
    mean_imputer = SimpleImputer(strategy='mean')
    imputed_datasets['Mean/Mode'] = pd.DataFrame(mean_imputer.fit_transform(df), columns=df.columns)
    
    print("2. Generating KNN Imputed Dataset...")
    knn_imputer = KNNImputer(n_neighbors=5, weights='uniform')
    imputed_datasets['KNN'] = pd.DataFrame(knn_imputer.fit_transform(df), columns=df.columns)

    print("3. Running Bayesian Imputation...")
    bayes_imp = IterativeImputer(estimator=BayesianRidge(), max_iter=10, random_state=42)
    imputed_datasets['Bayesian'] = pd.DataFrame(bayes_imp.fit_transform(df), columns=df.columns)

    print("4. Running Regression Imputation...")
    reg_imp = IterativeImputer(estimator=LinearRegression(), max_iter=10, random_state=42)
    imputed_datasets['Regression'] = pd.DataFrame(reg_imp.fit_transform(df), columns=df.columns)

    print("5. Running Predictive Mean Matching (PMM) Imputation...")
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
            
    pmm_imp = IterativeImputer(estimator=PMMRegressor(), max_iter=10, random_state=42)
    imputed_datasets['PMM'] = pd.DataFrame(pmm_imp.fit_transform(df), columns=df.columns)

    print("6. Running Multiple Random Forest Imputation...")
    rf_imp = IterativeImputer(estimator=RandomForestRegressor(n_estimators=10, random_state=42), max_iter=10, random_state=42)
    imputed_datasets['Random Forest'] = pd.DataFrame(rf_imp.fit_transform(df), columns=df.columns)

    print("7. Running Multiple Linear Regression with Bootstrap Imputation...")
    boot_reg_imp = IterativeImputer(estimator=BayesianRidge(), sample_posterior=True, max_iter=10, random_state=42)
    imputed_datasets['MLR Bootstrap'] = pd.DataFrame(boot_reg_imp.fit_transform(df), columns=df.columns)

    print("8. Running Multiple Imputation by Chain Equation (MICE)...")
    mice_imp = IterativeImputer(max_iter=10, random_state=42)
    imputed_datasets['MICE'] = pd.DataFrame(mice_imp.fit_transform(df), columns=df.columns)

    print("9. Running Hot Deck / Cold Deck Imputation...")
    df_hot_cold = df.copy()
    np.random.seed(42)
    for col in df_hot_cold.columns:
        observed = df_hot_cold[col].dropna()
        if len(observed) > 0:
            missing = df_hot_cold[col].isnull()
            df_hot_cold.loc[missing, col] = np.random.choice(observed, size=missing.sum())
    imputed_datasets['Hot/Cold Deck'] = df_hot_cold

    print("10. Running Carry Forward Carry Backward Imputation...")
    df_ff_bf = df.copy().ffill().bfill()
    df_ff_bf.fillna(0, inplace=True)
    imputed_datasets['Carry Fwd/Bwd'] = df_ff_bf

    print("11. Running Interpolation Imputation...")
    df_interp = df.copy().interpolate(method='linear').ffill().bfill()
    df_interp.fillna(0, inplace=True)
    imputed_datasets['Interpolation'] = df_interp
    
    print("\n--- Verification of Imputation ---")
    for name, imp_df in imputed_datasets.items():
        print(f"Missing values after {name}: {imp_df.isna().sum().sum()}")
    
    print("\nExporting default imputed datasets to CSV for manual validation...")
    imputed_datasets['Mean/Mode'].to_csv("cleaned_imputed_mean.csv", index=False)
    imputed_datasets['KNN'].to_csv("cleaned_imputed_knn.csv", index=False)
    
    print_section("Step 6 & 7: Model Training & Evaluation")
    
    def evaluate_dataset(data, imp_name):
        X = data.drop(columns=['Target_Binary', race_col] if race_col else ['Target_Binary'])
        y = data['Target_Binary']
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        
        models = {
            'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42),
            'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42),
            'SVC': SVC(random_state=42)
        }
        
        results = []
        for m_name, model in models.items():
            model.fit(X_train, y_train)
            preds = model.predict(X_test)
            
            acc = accuracy_score(y_test, preds)
            prec = precision_score(y_test, preds, zero_division=0)
            rec = recall_score(y_test, preds, zero_division=0)
            f1 = f1_score(y_test, preds, zero_division=0)
            
            results.append((imp_name, m_name, acc, prec, rec, f1))
            
        return results

    all_results = []
    for imp_name, imputed_df in imputed_datasets.items():
        print(f"Training on {imp_name} Imputed Data...")
        all_results.extend(evaluate_dataset(imputed_df, imp_name))
    
    print("\n" + "="*90)
    print(f"{'Imputation':<20} | {'Model':<20} | {'Accuracy':<10} | {'Precision':<10} | {'Recall':<10} | {'F1-Score':<10}")
    print("-" * 90)
    for res in all_results:
        imp, mod, acc, prec, rec, f1 = res
        print(f"{imp:<20} | {mod:<20} | {acc:<10.4f} | {prec:<10.4f} | {rec:<10.4f} | {f1:<10.4f}")
    print("="*90)
    
    duration = time.time() - start_time
    print(f"\nExecution finished in {duration:.2f} seconds.")

if __name__ == "__main__":
    main()
