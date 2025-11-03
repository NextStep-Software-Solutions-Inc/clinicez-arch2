const dummyHealth = {
    allergies: [
        { allergen: 'Peanuts', reaction: 'Anaphylaxis' },
        { allergen: 'Penicillin', reaction: 'Rash' },
        { allergen: 'Latex', reaction: 'Hives' },
        { allergen: 'Shellfish', reaction: 'Swelling' },
        { allergen: 'Dust Mites', reaction: 'Sneezing' },
        { allergen: 'Ibuprofen', reaction: 'Stomach pain' },
    ],
    medicalHistory: [
        {
            date: '2018-04-12',
            event: 'Diagnosed with Hypertension',
            doctor: 'Dr. Lee',
            location: 'City Clinic',
            notes: 'Patient presented with elevated blood pressure during routine checkup.'
        },
        {
            date: '2019-09-03',
            event: 'Hospitalized for Pneumonia',
            doctor: 'Dr. Smith',
            location: 'General Hospital',
            notes: 'Admitted for 5 days, treated with antibiotics.'
        },
        {
            date: '2020-02-18',
            event: 'Gallbladder Removal Surgery',
            doctor: 'Dr. Carter',
            location: 'Surgical Center',
            notes: 'Laparoscopic cholecystectomy, no complications.'
        },
        {
            date: '2021-07-22',
            event: 'Diabetes Type 2 Diagnosis',
            doctor: 'Dr. Patel',
            location: 'Endocrine Clinic',
            notes: 'Diagnosed after abnormal HbA1c results.'
        },
        {
            date: '2022-03-10',
            event: 'Appendectomy',
            doctor: 'Dr. Gomez',
            location: 'General Hospital',
            notes: 'Emergency surgery, recovered well.'
        },
        {
            date: '2022-08-15',
            event: 'Routine Cardiology Checkup',
            doctor: 'Dr. Lee',
            location: 'City Clinic',
            notes: 'No new findings.'
        },
        {
            date: '2023-01-28',
            event: 'Asthma Diagnosis',
            doctor: 'Dr. Patel',
            location: 'Pulmonary Center',
            notes: 'Prescribed inhaler.'
        },
        {
            date: '2023-03-12',
            event: 'ER Visit for Migraine',
            doctor: 'Dr. Smith',
            location: 'General Hospital',
            notes: 'Treated with IV fluids and pain relief.'
        },
        {
            date: '2023-05-05',
            event: 'Physical Therapy for Back Pain',
            doctor: 'Dr. Carter',
            location: 'Rehab Center',
            notes: 'Attended 8 sessions.'
        },
        {
            date: '2024-02-14',
            event: 'Fractured Wrist',
            doctor: 'Dr. Gomez',
            location: 'General Hospital',
            notes: 'Cast for 6 weeks.'
        },
        {
            date: '2024-07-18',
            event: 'Hospitalized for Severe Allergic Reaction',
            doctor: 'Dr. Lee',
            location: 'General Hospital',
            notes: 'Treated with epinephrine and steroids.'
        },
        {
            date: '2025-01-05',
            event: 'Annual Physical Exam',
            doctor: 'Dr. Carter',
            location: 'City Clinic',
            notes: 'All labs normal.'
        },
        {
            date: '2025-03-20',
            event: 'Routine Blood Pressure Monitoring',
            doctor: 'Dr. Lee',
            location: 'City Clinic',
            notes: 'Stable readings.'
        },
        {
            date: '2025-06-02',
            event: 'Specialist Consultation: Endocrinology',
            doctor: 'Dr. Patel',
            location: 'Endocrine Clinic',
            notes: 'Reviewed diabetes management.'
        },
    ],
    chronicConditions: [
        {
            name: 'Hypertension',
            diagnosed: '2018-04-12',
            doctor: 'Dr. Lee',
            notes: 'Elevated blood pressure during routine checkup.'
        },
        {
            name: 'Diabetes Type 2',
            diagnosed: '2021-07-22',
            doctor: 'Dr. Patel',
            notes: 'Abnormal HbA1c results.'
        },
        {
            name: 'Asthma',
            diagnosed: '2023-01-28',
            doctor: 'Dr. Patel',
            notes: 'Prescribed inhaler.'
        },
        {
            name: 'Chronic Back Pain',
            diagnosed: '2023-05-05',
            doctor: 'Dr. Carter',
            notes: 'Attended 8 physical therapy sessions.'
        },
    ],
    procedures: [
        {
            year: 2020,
            procedure: 'Gallbladder Removal',
            doctor: 'Dr. Carter',
            location: 'Surgical Center',
            notes: 'Laparoscopic cholecystectomy, no complications.'
        },
        {
            year: 2022,
            procedure: 'Appendectomy',
            doctor: 'Dr. Gomez',
            location: 'General Hospital',
            notes: 'Emergency surgery, recovered well.'
        },
        {
            year: 2023,
            procedure: 'Physical Therapy',
            doctor: 'Dr. Carter',
            location: 'Rehab Center',
            notes: 'Attended 8 sessions.'
        },
    ],
    hospitalVisits: [
        { date: '2023-03-12', reason: 'Migraine' },
        { date: '2024-07-18', reason: 'Allergic Reaction' },
        { date: '2025-01-05', reason: 'Routine Checkup' },
    ],
    labs: [
        { date: '2025-06-10', test: 'CBC', result: 'Normal' },
        { date: '2025-05-22', test: 'Lipid Panel', result: 'High Cholesterol' },
        { date: '2025-04-15', test: 'Blood Sugar', result: 'Normal' },
        { date: '2025-03-10', test: 'HbA1c', result: '7.2%' },
        { date: '2025-02-20', test: 'Chest X-Ray', result: 'Clear' },
    ],
};

export default dummyHealth;
