import pandas as pd
import numpy as np
import random

def generate_biased_dataset(n_rows=5000):
    np.random.seed(42)
    random.seed(42)
    
    data = []
    
    # Categories
    genders = ['Male', 'Female', 'Non-Binary']
    races = ['White', 'Black', 'Asian', 'Hispanic', 'Other']
    educations = ['High School', 'Bachelors', 'Masters', 'PhD']
    
    for i in range(n_rows):
        gender = random.choices(genders, weights=[45, 45, 10])[0]
        race = random.choices(races, weights=[50, 20, 15, 10, 5])[0]
        education = random.choices(educations, weights=[20, 50, 20, 10])[0]
        
        experience = np.random.randint(0, 20)
        coding_score = np.random.randint(40, 100)
        comm_score = np.random.randint(40, 100)
        
        # Base probability of being hired (Merit-based)
        # 0.4 * coding + 0.3 * exp + 0.2 * education + 0.1 * communication
        edu_weight = {'High School': 0, 'Bachelors': 10, 'Masters': 20, 'PhD': 30}
        merit_score = (coding_score * 0.4) + (experience * 2) + edu_weight[education] + (comm_score * 0.1)
        
        # Normalize merit to 0-1
        prob = merit_score / 100
        
        # INTRODUCE INTENTIONAL BIAS
        # 1. Gender Bias: Females get a -15% penalty
        if gender == 'Female':
            prob -= 0.15
        
        # 2. Race Bias: 'Black' and 'Hispanic' get a -20% penalty
        if race in ['Black', 'Hispanic']:
            prob -= 0.20
            
        # 3. Intersectionality: Black Female gets an extra -5% penalty
        if gender == 'Female' and race == 'Black':
            prob -= 0.05
            
        # Ensure prob is within [0, 1]
        prob = max(0.05, min(0.95, prob))
        
        hired = 1 if np.random.random() < prob else 0
        
        data.append({
            'Candidate_ID': f"CAN_{1000+i}",
            'Gender': gender,
            'Race': race,
            'Education': education,
            'Experience_Years': experience,
            'Coding_Score': coding_score,
            'Communication_Score': comm_score,
            'Zip_Code': random.randint(10000, 99999),
            'Hired': hired
        })
        
    df = pd.DataFrame(data)
    
    # Save to workspace
    filename = "biased_hiring_dataset.csv"
    df.to_csv(filename, index=False)
    print(f"Dataset generated: {filename}")
    
    # Calculate some metrics for transparency
    male_hiring = df[df['Gender'] == 'Male']['Hired'].mean()
    female_hiring = df[df['Gender'] == 'Female']['Hired'].mean()
    print(f"Male Hiring Rate: {male_hiring:.2%}")
    print(f"Female Hiring Rate: {female_hiring:.2%}")
    print(f"Statistical Parity Difference (Gender): {female_hiring - male_hiring:.3f}")

if __name__ == "__main__":
    generate_biased_dataset(5000)
