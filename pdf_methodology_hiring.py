import pandas as pd
import numpy as np
import time
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import SimpleImputer, KNNImputer, IterativeImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, confusion_matrix
import copy

import warnings
warnings.filterwarnings('ignore')

def inject_missing_data(df):
    """
    Inject MAR/MNAR missing values into Coding_Score and Communication_Score
    based on the Race attribute to simulate the PDF findings (higher missingness for some groups).
    """
    df_missing = df.copy()
    np.random.seed(42)
    
    # Missingness probabilities by race
    missing_probs = {
        'White': 0.05,
        'Asian': 0.05,
        'Black': 0.20,
        'Hispanic': 0.15,
        'Other': 0.10
    }
    
    for idx, row in df_missing.iterrows():
        race = row['Race']
        prob = missing_probs.get(race, 0.10)
        
        if np.random.rand() < prob:
            df_missing.at[idx, 'Coding_Score'] = np.nan
        
        if np.random.rand() < prob:
            df_missing.at[idx, 'Communication_Score'] = np.nan
            
    return df_missing

def get_fairness_metrics(y_true, y_pred, sensitive_attr_test, privileged_class='White'):
    """
    Compute TPR, FPR, Equalized Odds for privileged vs unprivileged groups.
    Here we compare the specific race vs all other races (one-vs-all approach as in PDF).
    """
    metrics = {}
    races = np.unique(sensitive_attr_test)
    
    for race in races:
        # one vs all
        mask_group = (sensitive_attr_test == race)
        mask_other = (sensitive_attr_test != race)
        
        tn_g, fp_g, fn_g, tp_g = confusion_matrix(y_true[mask_group], y_pred[mask_group], labels=[0, 1]).ravel()
        tn_o, fp_o, fn_o, tp_o = confusion_matrix(y_true[mask_other], y_pred[mask_other], labels=[0, 1]).ravel()
        
        tpr_g = tp_g / (tp_g + fn_g) if (tp_g + fn_g) > 0 else 0
        fpr_g = fp_g / (fp_g + tn_g) if (fp_g + tn_g) > 0 else 0
        
        tpr_o = tp_o / (tp_o + fn_o) if (tp_o + fn_o) > 0 else 0
        fpr_o = fp_o / (fp_o + tn_o) if (fp_o + tn_o) > 0 else 0
        
        eq_opp_diff = tpr_g - tpr_o  # Equal Opportunity
        pred_eq_diff = fpr_g - fpr_o # Predictive Equality
        eq_odds = 0.5 * (eq_opp_diff + pred_eq_diff) # Equalized Odds
        
        metrics[race] = {
            'Equal_Opportunity': eq_opp_diff,
            'Predictive_Equality': pred_eq_diff,
            'Equalized_Odds': eq_odds
        }
        
    return metrics

def subgroup_median_impute(df, groupby_col):
    df_imputed = df.copy()
    for col in df_imputed.columns:
        if df_imputed[col].isnull().sum() > 0 and pd.api.types.is_numeric_dtype(df_imputed[col]):
            df_imputed[col] = df_imputed.groupby(groupby_col)[col].transform(lambda x: x.fillna(x.median()))
    # fill remaining with overall median
    df_imputed.fillna(df_imputed.median(numeric_only=True), inplace=True)
    return df_imputed

def pbi_impute(df_train, df_test, target_cols, feature_cols):
    """ Predictor-Based Imputation using Random Forest """
    df_train_imp = df_train.copy()
    df_test_imp = df_test.copy()
    
    for col in target_cols:
        # train RF on complete rows for this column
        train_complete = df_train_imp.dropna(subset=[col])
        if len(train_complete) == 0:
            continue
            
        X_tr = train_complete[feature_cols].fillna(0) # naive fill for predictors just to train imputer
        y_tr = train_complete[col]
        
        rf = RandomForestRegressor(n_estimators=50, random_state=42)
        rf.fit(X_tr, y_tr)
        
        # impute train
        missing_train = df_train_imp[col].isnull()
        if missing_train.sum() > 0:
            df_train_imp.loc[missing_train, col] = rf.predict(df_train_imp.loc[missing_train, feature_cols].fillna(0))
            
        # impute test
        missing_test = df_test_imp[col].isnull()
        if missing_test.sum() > 0:
            df_test_imp.loc[missing_test, col] = rf.predict(df_test_imp.loc[missing_test, feature_cols].fillna(0))
            
    return df_train_imp, df_test_imp

def missing_indicators_impute(df_train, df_test):
    df_train_imp = df_train.copy()
    df_test_imp = df_test.copy()
    
    for col in df_train.columns:
        if df_train[col].isnull().sum() > 0:
            df_train_imp[col + '_missing'] = df_train[col].isnull().astype(int)
            df_test_imp[col + '_missing'] = df_test[col].isnull().astype(int)
            
    # fill actual NA with 0
    df_train_imp.fillna(0, inplace=True)
    df_test_imp.fillna(0, inplace=True)
    
    return df_train_imp, df_test_imp

def get_reweighing_weights(df, sensitive_attr, target_col):
    """ Reweighing technique to compute instance weights """
    n = len(df)
    weights = np.ones(n)
    groups = df[sensitive_attr].unique()
    labels = df[target_col].unique()
    
    for g in groups:
        for l in labels:
            p_g = len(df[df[sensitive_attr] == g]) / n
            p_l = len(df[df[target_col] == l]) / n
            p_gl = len(df[(df[sensitive_attr] == g) & (df[target_col] == l)]) / n
            if p_gl > 0:
                w = (p_g * p_l) / p_gl
                mask = (df[sensitive_attr] == g) & (df[target_col] == l)
                weights[mask] = w
    return weights

def run_experiment():
    print("Loading dataset...")
    df = pd.read_csv("biased_hiring_dataset.csv")
    
    print("Injecting missing data...")
    df_miss = inject_missing_data(df)
    
    # Prepare features
    features = ['Gender', 'Education', 'Experience_Years', 'Coding_Score', 'Communication_Score']
    target = 'Hired'
    sensitive_attr = 'Race'
    
    # Encode categoricals
    le_dict = {}
    for col in ['Gender', 'Education', 'Race']:
        le = LabelEncoder()
        df_miss[col] = le.fit_transform(df_miss[col].astype(str))
        le_dict[col] = le
        
    # Split Data
    X = df_miss[features + [sensitive_attr]]
    y = df_miss[target]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Store test sensitive attributes for later (unencoded)
    race_test_encoded = X_test[sensitive_attr].values
    race_test = le_dict['Race'].inverse_transform(race_test_encoded)
    
    # Drop sensitive attribute from features for model training to avoid direct bias
    # Actually, the PDF might keep it. Let's keep it but just track it.
    X_train_features = X_train.drop(columns=[sensitive_attr])
    X_test_features = X_test.drop(columns=[sensitive_attr])
    
    models = {
        'RF': RandomForestClassifier(n_estimators=100, random_state=42),
        'LR': LogisticRegression(max_iter=1000, random_state=42),
        'SVC': SVC(random_state=42)
    }
    
    results = []

    print("Running Imputation Strategies...")
    
    # 1. Median Imputation
    imp_median = SimpleImputer(strategy='median')
    X_tr_med = pd.DataFrame(imp_median.fit_transform(X_train_features), columns=X_train_features.columns)
    X_te_med = pd.DataFrame(imp_median.transform(X_test_features), columns=X_test_features.columns)
    
    # 2. Subgroup Median Imputation
    # Re-attach race temporarily
    X_train_temp = X_train.copy()
    X_test_temp = X_test.copy()
    X_tr_sub = subgroup_median_impute(X_train_temp, sensitive_attr).drop(columns=[sensitive_attr])
    # For test, we impute using test subgroups for simplicity, or we could map from train.
    X_te_sub = subgroup_median_impute(X_test_temp, sensitive_attr).drop(columns=[sensitive_attr])
    
    # 3. KNN Imputation
    imp_knn = KNNImputer(n_neighbors=5)
    X_tr_knn = pd.DataFrame(imp_knn.fit_transform(X_train_features), columns=X_train_features.columns)
    X_te_knn = pd.DataFrame(imp_knn.transform(X_test_features), columns=X_test_features.columns)
    
    # 4. Iterative Imputation
    imp_iter = IterativeImputer(random_state=42)
    X_tr_iter = pd.DataFrame(imp_iter.fit_transform(X_train_features), columns=X_train_features.columns)
    X_te_iter = pd.DataFrame(imp_iter.transform(X_test_features), columns=X_test_features.columns)
    
    # 5. PBI
    # Predictors: Gender, Education, Experience
    # Targets to impute: Coding_Score, Communication_Score
    X_tr_pbi, X_te_pbi = pbi_impute(X_train_features, X_test_features, ['Coding_Score', 'Communication_Score'], ['Gender', 'Education', 'Experience_Years'])
    
    # 6. Reweighing (RW) - Uses Iterative imputation as base
    # Calculate weights on train
    df_train_full = X_train.copy()
    df_train_full[target] = y_train
    weights_tr = get_reweighing_weights(df_train_full, sensitive_attr, target)
    X_tr_rw = X_tr_iter.copy()
    X_te_rw = X_te_iter.copy()

    # 7. Missing Indicators
    X_tr_miss, X_te_miss = missing_indicators_impute(X_train_features, X_test_features)
    
    imputations = {
        'Median': (X_tr_med, X_te_med, None),
        'Subgroup': (X_tr_sub, X_te_sub, None),
        'KNN': (X_tr_knn, X_te_knn, None),
        'Iterative': (X_tr_iter, X_te_iter, None),
        'PBI': (X_tr_pbi, X_te_pbi, None),
        'RW': (X_tr_rw, X_te_rw, weights_tr), # DIR is complex, we use RW as main fairness technique
        'MISS': (X_tr_miss, X_te_miss, None)
    }
    
    scaler = StandardScaler()

    for imp_name, (X_tr, X_te, weights) in imputations.items():
        print(f"Evaluating Imputation: {imp_name}")
        
        # Scale features
        X_tr_scaled = scaler.fit_transform(X_tr)
        X_te_scaled = scaler.transform(X_te)
        
        for model_name, model in models.items():
            if imp_name == 'RW' and model_name == 'SVC':
                # SVC doesn't support sample_weight well in sklearn directly without tweaking, using standard fit
                # PDF says RW cannot be applied to SVC, so skip or run normally
                model.fit(X_tr_scaled, y_train)
            else:
                if weights is not None:
                    model.fit(X_tr_scaled, y_train, sample_weight=weights)
                else:
                    model.fit(X_tr_scaled, y_train)
                
            y_pred = model.predict(X_te_scaled)
            acc = accuracy_score(y_test, y_pred)
            
            fair_metrics = get_fairness_metrics(y_test.values, y_pred, race_test)
            
            # Compute average Equalized Odds across all unprivileged groups vs White
            avg_eq_odds = np.mean([abs(fair_metrics[r]['Equalized_Odds']) for r in fair_metrics if r != 'White'])
            
            results.append({
                'Imputation': imp_name,
                'Model': model_name,
                'Accuracy': acc,
                'Avg_Abs_Eq_Odds_Disparity': avg_eq_odds
            })
            
    df_results = pd.DataFrame(results)
    print("\n" + "="*60)
    print("FINAL RESULTS")
    print("="*60)
    print(df_results.to_string(index=False))
    
    df_results.to_csv("fairness_results_summary.csv", index=False)
    print("\nResults saved to fairness_results_summary.csv")

if __name__ == "__main__":
    run_experiment()
