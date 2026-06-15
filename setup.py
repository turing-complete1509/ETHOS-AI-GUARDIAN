from setuptools import setup, find_packages

setup(
    name="ethos_guardian",
    version="0.1.0",
    description="ETHOS AI Guardian: Mathematical Bias Auditing, Mitigation, and Tabular Imputation",
    author="Mannat Gupta",
    packages=find_packages(),
    install_requires=[
        "pandas>=1.3.0",
        "numpy>=1.20.0",
        "scikit-learn>=1.0.0",
        "torch>=1.9.0",
        "google-generativeai>=0.3.0",
    ],
    python_requires=">=3.8",
)
