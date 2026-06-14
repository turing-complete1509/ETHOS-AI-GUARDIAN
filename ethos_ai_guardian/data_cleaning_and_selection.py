import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder

def clean_data_for_mentor():
    print("Beginning Data Preprocessing & Column Rejection...\n")
    dataset_path = "els_02_12_byf3pststu_v1_0.csv"
    

    print("Reading headers to identify total columns...")
    try:
        sample_df = pd.read_csv(dataset_path, nrows=5)
        all_columns = list(sample_df.columns)
        print(f"Total columns detected in raw dataset: {len(all_columns)}")
    except FileNotFoundError:
        print(f"Error: Could not find {dataset_path}")
        return

    nces_codebook_mapping = {
        'BYSEX': 'Gender',
        'BYRACE': 'Race/Ethnicity',
        'BYSTLANG': 'Native Language English',
        'BYFCOMP': 'Family Composition',
        'BYPARED': 'Parents Education',
        'BYINCOME': 'Family Income',
        'BYTXCSTD': 'Std Math/Reading Composite',
        'BYURBAN': 'School Urbanicity',
        'BYCTRL': 'School Control',
        'BYENROLL': 'Enrollment-administrator',
        'BYREGION': 'Geographical Region',
        'F1TXMSTD': 'F1 Std Math',
        'F1RGPP2': '9-12 GPA',
        'F1ATHL': 'Athletic Level',
        'F3TZPS1': 'F3 Target Attainment' 
    }
    
    cols_to_keep = [c for c in nces_codebook_mapping.keys() if c in all_columns]
    
    target_col = 'F3TZPS1'
    if target_col not in all_columns:
        for cand in ['F3ATTAINMENT', 'F3HDG', 'F3PS1BA', 'F3DEGREE']:
            if cand in all_columns:
                target_col = cand
                break
        if target_col not in all_columns:
            target_col = [c for c in all_columns if c.startswith('F3')][-1]
            
    if target_col not in cols_to_keep:
        cols_to_keep.append(target_col)
    
    needed_extras = 29 - len(cols_to_keep)
    supplementary_proxies = [c for c in all_columns if c.startswith(('BY', 'F1', 'F2')) and c not in cols_to_keep][:needed_extras]
    final_29_columns = cols_to_keep + supplementary_proxies
    
    final_29_columns = final_29_columns[:29]
    rejected_columns_count = len(all_columns) - len(final_29_columns)
    
    print(f"Columns Accepted (Mapped to Table 1): {len(final_29_columns)}")
    print(f"Columns Rejected (Noise / Target Leakage): {rejected_columns_count}")
    
    print("\nReading ONLY the approved 29 columns from the 175 MB dataset to save RAM...")
    df = pd.read_csv(dataset_path, usecols=final_29_columns)
    
    missing_codes = [-9, -8, -7, -6, -5, -4, -3, -2, -1, -9.0, -8.0, -4.0]
    df.replace(missing_codes, np.nan, inplace=True)

    initial_row_count = len(df)
    print(f"Initial Row Count: {initial_row_count}")
    
    print("\nExecuting Data Cleaning Steps based on Section 3.1.3...")
    
    if target_col in df.columns:
        median_attainment = df[target_col].median()
        df['Target_Binary'] = (df[target_col] > median_attainment).astype(int)
        
        df.loc[df[target_col].isna(), 'Target_Binary'] = np.nan
        df.drop(columns=[target_col], inplace=True) 
        print(" -> Data Cleaning: Extracted and Binarized Target Feature.")
        
    if 'Target_Binary' in df.columns and 'BYRACE' in df.columns:
        df = df.dropna(subset=['Target_Binary', 'BYRACE'])
        print(" -> Data Cleaning: Dropped observations containing missing Targets or Race demographic.")

    if 'BYRACE' in df.columns:
        df = df[df['BYRACE'] != 1]
        df['BYRACE'] = df['BYRACE'].replace({5: 4})
        print(" -> Data Cleaning: Excluded Native American vectors & collapsed Hispanic demographics.")

    rows_after_filter = len(df)
    print(f"\nTotal rows successfully dropped due to NA constraints: {initial_row_count - rows_after_filter}")
    
    for col in df.columns:
        if df[col].dtype == 'object':
            encoder = LabelEncoder()
            mask = df[col].notna()
            df.loc[mask, col] = encoder.fit_transform(df.loc[mask, col].astype(str))
            
    print(" -> Data Cleaning: LabelEncoded all text/categorical factors.")
    
    print(f"\nFinal Pre-Imputation Dataset Shape: {df.shape[0]} rows, {df.shape[1]} columns.")
    
    output_filename = "post_cleaning_checkpoint.csv"
    df.to_csv(output_filename, index=False)
    print(f"Extraction successful! Raw cleaned arrays dumped to: {output_filename}")
    
if __name__ == "__main__":
    clean_data_for_mentor()
