from setuptools import setup, find_packages
import os

# Read the contents of your README file
this_directory = os.path.abspath(os.path.dirname(__file__))
with open(os.path.join(this_directory, "README.md"), encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="ethos_ai_guardian",
    version="0.1.0",
    description="Ethos AI Guardian: Automated bias detection and mitigation for machine learning models.",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Ethos AI Team",
    packages=find_packages(),
    install_requires=[
        "pandas",
        "numpy",
        "torch",
        "scikit-learn"
    ],
    python_requires=">=3.8",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
)
