import pandas as pd
import re

def is_id_or_pk_column(col_name: str, series: pd.Series) -> bool:
    """
    Determines if a column is likely a primary key, unique ID, candidate ID, or name column.
    Uses pattern checks on the column name and uniqueness checks on the data.
    """
    name = str(col_name).lower().strip()
    name_clean = re.sub(r'[^a-z0-9]', '', name)
    
    id_keywords = [
        r"^id$", r"^ids$", r"candidate_?id", r"applicant_?id", r"employee_?id", 
        r"number_?id", r"name$", r"names$", r"^index$", r"_id$"
    ]
    
    if any(re.search(pattern, name) for pattern in id_keywords):
        return True
        
    if any(kw in name_clean for kw in ["candidateid", "applicantid", "employeeid", "numberid", "serial", "ssn", "passport", "username", "firstname", "lastname", "fullname"]):
        return True
        
    # Check uniqueness for non-numeric/string columns
    if not pd.api.types.is_numeric_dtype(series):
        total = len(series.dropna())
        if total > 5 and series.nunique() == total:
            return True
            
    return False

def drop_id_columns(df: pd.DataFrame, verbose: bool = True) -> pd.DataFrame:
    """
    Scans a pandas DataFrame and drops columns identified as unique IDs, candidate IDs, or name fields.
    """
    cols_to_drop = []
    for col in df.columns:
        if is_id_or_pk_column(col, df[col]):
            cols_to_drop.append(col)
            
    if cols_to_drop:
        if verbose:
            print(f"[Ethos Guardian] Auto-detected and dropped primary key/unique ID columns: {cols_to_drop}")
        return df.drop(columns=cols_to_drop)
    return df.copy()
