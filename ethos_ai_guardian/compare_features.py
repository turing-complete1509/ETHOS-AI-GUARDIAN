 import pandas as pd
import numpy as np
import time
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

def print_section(title):
    print(f"\n{'='*50}\n{title}\n{'='*50}")

def evaluate_dataset(data, imp_name, race_col):
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

def main():
    start_time = time.time()
    dataset_path = "els_02_12_byf3pststu_v1_0.csv"
    print_section("Loading Full Dataset (~4000 cols)")
    
    try:
        sample_df = pd.read_csv(dataset_path, nrows=5)
    except FileNotFoundError:
        print(f"ERROR: File {dataset_path} not found.")
        return

    available_cols = list(sample_df.columns)
    
    nces_columns = {
        'gender': 'BYSEX', 'Race': 'BYRACE', 'English': 'BYSTLANG',
        'Parents Education': 'BYPARED', 'Family Income': 'BYINCOME',
        'Athletic level': 'F1ATHL', '9 12 GPA': 'F1RGPP2',
        'F1 Std Math': 'F1TXMSTD', 'Std Math/Reading': 'BYTXCSTD',
        'School Urbanicity': 'BYURBAN', 'School Control': 'BYCTRL',
        'Enrollment-administrator': 'BYENROLL', 'Geographical Region': 'BYREGION',
        'Target': 'F3TZPS1' 
    }
    
    selected_cols = [code for name, code in nces_columns.items() if code in available_cols]
    extra_cols = [c for c in available_cols if c.startswith(('BY', 'F1', 'F2'))][:20]
    final_cols = list(set(selected_cols + extra_cols))
    
    target_var = None
    for cand in ['F3TZPS1', 'F3ATTAINMENT', 'F3HDG', 'F3PS1BA', 'F3DEGREE']:
        if cand in available_cols:
            target_var = cand
            break
            
    if target_var is None:
        target_var = [c for c in available_cols if c.startswith('F3')][-1]
    if target_var not in final_cols:
        final_cols.append(target_var)

    missing_codes = [-9, -8, -7, -6, -5, -4, -3, -2, -1, -9.0, -8.0, -4.0]
    
    print("Reading dataframe (full) ...")
    df_full = pd.read_csv(dataset_path)
    df_full.replace(missing_codes, np.nan, inplace=True)
    
    print("Reading dataframe (subset) ...")
    df_sub = pd.read_csv(dataset_path, usecols=final_cols)
    df_sub.replace(missing_codes, np.nan, inplace=True)

    def clean_and_prepare(df):
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

        # Label encoding
        for col in df.columns:
            if df[col].dtype == 'object':
                le = LabelEncoder()
                mask = df[col].notna()
                df.loc[mask, col] = le.fit_transform(df.loc[mask, col].astype(str))
                
        df.dropna(axis=1, how='all', inplace=True)
        return df, race_col

    print_section("Cleaning datasets")
    df_full_clean, race_col_full = clean_and_prepare(df_full.copy())
    df_sub_clean, race_col_sub = clean_and_prepare(df_sub.copy())
    
    print(f"Full dataset shape: {df_full_clean.shape}")
    print(f"Subset dataset shape: {df_sub_clean.shape}")

    print_section("Applying Mean Imputation")
    mean_imputer = SimpleImputer(strategy='mean')
    
    print("Imputing full dataset...")
    df_full_imputed = pd.DataFrame(mean_imputer.fit_transform(df_full_clean), columns=df_full_clean.columns)
    
    print("Imputing subset dataset...")
    df_sub_imputed = pd.DataFrame(mean_imputer.fit_transform(df_sub_clean), columns=df_sub_clean.columns)

    print_section("Evaluating Models")
    all_results = []
    
    print("Evaluating on Subset (Dropped Columns) Data...")
    all_results.extend(evaluate_dataset(df_sub_imputed, "Subset (Dropped Cols)", race_col_sub))
    
    print("Evaluating on Full (All 4000 Cols) Data...")
    all_results.extend(evaluate_dataset(df_full_imputed, "Full (All Cols)", race_col_full))

    print("\n" + "="*90)
    print(f"{'Dataset Setup':<25} | {'Model':<20} | {'Accuracy':<10} | {'Precision':<10} | {'Recall':<10} | {'F1-Score':<10}")
    print("-" * 90)
    for res in all_results:
        imp, mod, acc, prec, rec, f1 = res
        print(f"{imp:<25} | {mod:<20} | {acc:<10.4f} | {prec:<10.4f} | {rec:<10.4f} | {f1:<10.4f}")
    print("="*90)

    duration = time.time() - start_time
    print(f"\nExecution finished in {duration:.2f} seconds.")

if __name__ == "__main__":
    main()
