import csv
import random

random.seed(42)

# Biased hiring dataset
# Males are approved ~85% of the time, Females ~35%
# White/Asian are approved ~80%, Black/Hispanic ~30%
# Education and Experience are also correlated with bias

genders = ['Male', 'Female']
races = ['White', 'Black', 'Hispanic', 'Asian']
education_levels = ['High School', 'Bachelor', 'Master', 'PhD']
departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance']

rows = []

for i in range(1000):
    gender = random.choice(genders)
    race = random.choice(races)
    age = random.randint(22, 60)
    education = random.choices(education_levels, weights=[20, 40, 30, 10])[0]
    experience = random.randint(0, 30)
    department = random.choice(departments)
    salary_expectation = random.randint(35000, 120000)

    # BIAS: Base approval probability
    base_prob = 0.55

    # Gender bias
    if gender == 'Male':
        base_prob += 0.25
    else:
        base_prob -= 0.20

    # Race bias
    if race == 'White':
        base_prob += 0.20
    elif race == 'Asian':
        base_prob += 0.10
    elif race == 'Black':
        base_prob -= 0.20
    elif race == 'Hispanic':
        base_prob -= 0.15

    # Slight legitimate signal (education & experience)
    if education == 'PhD':
        base_prob += 0.05
    elif education == 'Master':
        base_prob += 0.03
    if experience > 10:
        base_prob += 0.05

    base_prob = max(0.05, min(0.95, base_prob))
    hired = 1 if random.random() < base_prob else 0

    rows.append({
        'ApplicantID': i + 1,
        'Age': age,
        'Gender': gender,
        'Race': race,
        'Education': education,
        'YearsExperience': experience,
        'Department': department,
        'SalaryExpectation': salary_expectation,
        'Hired': 'Yes' if hired == 1 else 'No'
    })

output_file = r'c:\Users\manna\OneDrive\Desktop\Data Cleaning\biased_hiring_dataset.csv'

with open(output_file, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

# Print bias statistics
male_hired = sum(1 for r in rows if r['Gender'] == 'Male' and r['Hired'] == 'Yes')
female_hired = sum(1 for r in rows if r['Gender'] == 'Female' and r['Hired'] == 'Yes')
male_total = sum(1 for r in rows if r['Gender'] == 'Male')
female_total = sum(1 for r in rows if r['Gender'] == 'Female')

print("=== BIAS STATISTICS ===")
print(f"Male hire rate:   {male_hired}/{male_total} = {male_hired/male_total:.1%}")
print(f"Female hire rate: {female_hired}/{female_total} = {female_hired/female_total:.1%}")
print()

for race in ['White', 'Black', 'Hispanic', 'Asian']:
    r_hired = sum(1 for r in rows if r['Race'] == race and r['Hired'] == 'Yes')
    r_total = sum(1 for r in rows if r['Race'] == race)
    print(f"{race:10s} hire rate: {r_hired}/{r_total} = {r_hired/r_total:.1%}")

print(f"\nDataset saved to: {output_file}")
