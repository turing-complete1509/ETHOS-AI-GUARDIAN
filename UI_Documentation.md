# DataSci AI: Platform Architecture & UI Guide

This document provides a comprehensive overview of the **DataSci AI (Insight Weaver)** user interface, detailing exactly how the platform operates as a gamified, high-performance pipeline for taking raw datasets into production-ready predictive models.

## The Core Philosophy
The UI is designed to mimic the exact methodology of the `VAINA-PRIMARY` academic approach. It physically protects the user from "Data Paralysis" by strictly routing them along a linear, intelligent pipeline. The memory architecture holds massive datasets (like `els_02` with 4,000+ variables) invisibly in the background while selectively serving specific UI features to maintain a fluid 60FPS experience.

---

### Step 1: Data Ingestion (`UploadPage.tsx`)
**Goal:** Ingest massive files seamlessly without freezing the browser.
* **Componentry:** Features an interactive drag-and-drop zone using `react-dropzone`.
* **Under the Hood:** Uses a background `WebWorker` via `PapaParse` to parse massive `.csv` files natively in standard Javascript arrays, bypassing DOM freezing.
* **UI Features:**
  * Displays file weight and estimated variables instantly.
  * Shows a quick 10-row, 15-column "Capped Render" table so the user can verify data format before proceeding to the expensive health calculation phase.

### Step 2: Quality Assessment (`OverviewPage.tsx`)
**Goal:** Give a 30,000-foot view of dataset health and missingness.
* **Componentry:** Four high-level metric cards detailing Rows, Variables, Imputation Risks, and Data Types.
* **Under the Hood:** Iterates via custom O(N) linear loops across raw arrays (instead of `Array.map`) to avoid Javascript RAM bounds, aggressively detecting strings, integers, and boolean characteristics.
* **UI Features:**
  * **Categorical / Numeric Split:** Donut chart separating numerical items from character strings.
  * **Missing Data Log:** A vertical cap table strictly returning the 50 most corrupted features by missing percentages to warn the user of destructive imputation limits.

### Step 3: Feature Architecture (`FeatureSelectionPage.tsx`)
**Goal:** Eliminate dataset noise mathematically to ensure the final models are computationally fast and accurate.
* **Componentry:** A multi-stage sequential visualization representing the funneling process map of the `els_02` dataset.
* **Under the Hood:**
  1. **Filter 1:** Dropping variables where `>50%` of records are null (Drops ~1,820 variables).
  2. **Filter 2:** Dropping Zero-Variance features that offer zero statistical power (Drops 3 variables).
  3. **Filter 3:** A Mutual Information Threshold prioritizing predictability (Drops ~2,160 variables).
* **Execution:** Once the `Commit Optimization` button is clicked, this mathematically deletes over 3,000 noisy variables directly from local React memory, scaling the pipeline down to **29 perfect features**.

### Step 4: Exploratory Data Analysis (`EdaPage.tsx`)
**Goal:** Provide an interactive playground to discover patterns in the surviving high-value features.
* **Componentry:** Built using the `Recharts` SVG graphing library.
* **UI Features:**
  * **Sidebar:** A dynamically generated list of features color-coded by variable type.
  * **Distribution:** An automatic histogram mathematically sizing internal thresholds so you can instantly ascertain standard deviation metrics.
  * **Box Plot Console:** Presents Q1, Q3, Min, Max, Mean, and Median without manual calculation.
  * **Scatter Plot Engine:** Dual-axis selector automatically dropping values to visual grids.
  * **Correlation Heatmap:** Calculates Pearson coefficient interactions to detect multicollinearity natively.

### Step 5: Imputation Lab (`ImputationPage.tsx`)
**Goal:** Address any remaining missing values natively before hitting machine learning algorithms.
* **UI Features:** 
  * Displays specific variables that have missing metrics.
  * Allows the user to select from an array of 9 complex Academic architectures: Mean/Mode, Bayesian Regression, Predictive Mean Matching, MICE, Random Forests, Carry-Forward, Hot Deck, Bootstrapping, and Interpolation.

### Step 6: Feature Engineering (`FeaturePage.tsx`)
**Goal:** Process string elements to numerical scales for the AI models.
* **UI Features:** 
  * **Categorical Encoding:** Toggles between `One-Hot Encoding` and `Label/Ordinal Encoding`.
  * **Scaling Vectors:** Options to apply a `Z-Score Standard distribution` or `MinMax normalization`.
  * **Collinearity Thresholds:** A drag-slider dropping fields that surpass a ~0.80 interaction map visually.

### Step 7: AI Model Lab (`ModelPage.tsx`)
**Goal:** Act as an auto-ML execution environment comparing cutting edge trees.
* **UI Features:**
  * **AI Diagnosis:** An intelligent parser that reads your target label and dictates whether the environment should run as a **Regression** engine or **Classification** engine.
  * **Processing Animation:** A simulated high-end graphic charting `Loss function` decay alongside parallel training epochs.
  * **Results Grid:** Horizontal reporting matrix showing the best baseline Model (e.g. Random Forest vs Logistic Regression vs XGBoost vs SVM) via predictive F-Score metrics natively.

### Step 8: Explainability & Insights (`ResultsPage.tsx`)
**Goal:** Turn Machine Learning into a cohesive story for academic presentation.
* **UI Features:**
  * A SHAP/LIME visualization showing exact feature impacts towards an individual prediction.
  * Confusion matrices natively breaking down Sensitivity, Specificity, and False Negative impacts relative to the `els_02` sociological study variables.

---
### Technical Design Choices
- **Framer Motion:** Every single component transitions onto the screen sequentially (opacity fade + y-axis slide) providing a fluid, gamified feeling.
- **Glassmorphism:** Leveraging `backdrop-blur` CSS tokens against a dark-slate background to give the aesthetic of premium "Silicon Valley AI tools".
- **Infinite Loop Scaling:** Because mapping DOM components linearly correlates to RAM degradation on React, critical lists (like the EDA Sidebar or Missing Data log) are hard-capped (`slice(0,100)`). If a user ever attempts to bypass the **Feature Selection Funnel**, the UI safely ignores processing the excess 3,900+ variables instead of instantly crashing the browser engine.
