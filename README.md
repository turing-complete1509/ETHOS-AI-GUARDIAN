# Ethos AI Guardian

Ethos AI Guardian is a powerful, automated bias detection and mitigation toolkit for machine learning models. Built specifically for data scientists, it provides a seamless pipeline to identify historical, confounding, and selection biases in your datasets, and mitigates them using state-of-the-art techniques.

## Features

- **Automated Bias Detection:** Quickly scan datasets for Statistical Parity, Disparate Impact, and Equal Opportunity differences.
- **Deep Contextual Debiasing:** Pro-level Tabular Transformers to understand contextual bias in categorical and numerical features.
- **Adversarial Mitigation:** Uses an adversarial debiasing architecture to enforce fairness without sacrificing predictive power.
- **Pipelines:** Easy-to-use Scikit-Learn style pipelines for integrating into your existing workflow.

## Installation

You can install `ethos_ai_guardian` using pip:

```bash
pip install ethos_ai_guardian
```

## Quick Start

```python
import pandas as pd
from ethos_ai_guardian import AntiBiasPipeline

# Load your dataset
df = pd.read_csv("your_data.csv")

# Initialize the pipeline
pipeline = AntiBiasPipeline(model_type='logistic')

# Run automated bias mitigation
results = pipeline.train_and_evaluate(
    df=df, 
    features=['age', 'income', 'education'], 
    sensitive_attr='gender', 
    target_col='approved'
)

print(results["fairness_metrics"])
```

## License

MIT License
