let currentQuestion = 0;
let score = 0;
let questions = [];
let userAnswers = [];
let lastDegree = -1;
let lastQuestionType = '';

// Updated chord data with proper flat handling
const majorChords = [
// C Major
["C", "D minor", "E minor", "F", "G", "A minor", "B diminished",
"Db", "Eb", "Gb", "Ab", "Bb"],
// C# Major
["C#", "D# minor", "E# minor", "F#", "G#", "A# minor", "B# diminished",
"D", "E", "G", "A", "B"],
// D Major
["D", "E minor", "F# minor", "G", "A", "B minor", "C# diminished",
"Eb", "F", "Ab", "Bb", "C"],
// Eb Major
["Eb", "F minor", "G minor", "Ab", "Bb", "C minor", "D diminished",
"E", "Gb", "A", "B", "Db"],
// E Major
["E", "F# minor", "G# minor", "A", "B", "C# minor", "D# diminished",
"F", "G", "A#", "C", "D"],
// F Major
["F", "G minor", "A minor", "Bb", "C", "D minor", "E diminished",
"Gb", "Ab", "B", "Db", "Eb"],
// F# Major
["F#", "G# minor", "A# minor", "B", "C#", "D# minor", "E# diminished",
"G", "A", "C", "D", "E"],
// G Major
["G", "A minor", "B minor", "C", "D", "E minor", "F# diminished",
"Ab", "Bb", "Db", "Eb", "F"],
// Ab Major
["Ab", "Bb minor", "C minor", "Db", "Eb", "F minor", "G diminished",
"A", "B", "D", "E", "Gb"],
// A Major
["A", "B minor", "C# minor", "D", "E", "F# minor", "G# diminished",
"Bb", "C", "Eb", "F", "G"],
// Bb Major
["Bb", "C minor", "D minor", "Eb", "F", "G minor", "A diminished",
"B", "Db", "E", "Gb", "Ab"],
// B Major
["B", "C# minor", "D# minor", "E", "F#", "G# minor", "A# diminished",
"C", "D", "F", "G", "A"]
];

const minorChords = [
// C minor
["C minor", "D diminished", "Eb", "F minor", "G minor", "Ab", "Bb",
"Db", "E", "Gb", "A", "B"],
// C# minor
["C# minor", "D# diminished", "E", "F# minor", "G# minor", "A", "B",
"D", "F", "G", "A#", "C"],
// D minor
["D minor", "E diminished", "F", "G minor", "A minor", "Bb", "C",
"Eb", "F#", "Ab", "B", "Db"],
// Eb minor
["Eb minor", "F diminished", "Gb", "Ab minor", "Bb minor", "B", "Db",
"E", "G", "A", "C", "D"],
// E minor
["E minor", "F# diminished", "G", "A minor", "B minor", "C", "D",
"F", "G#", "Bb", "Db", "Eb"],
// F minor
["F minor", "G diminished", "Ab", "Bb minor", "C minor", "Db", "Eb",
"Gb", "A", "B", "D", "E"],
// F# minor
["F# minor", "G# diminished", "A", "B minor", "C# minor", "D", "E",
"G", "A#", "C", "Eb", "F"],
// G minor
["G minor", "A diminished", "Bb", "C minor", "D minor", "Eb", "F",
"Ab", "B", "Db", "E", "Gb"],
// Ab minor
["Ab minor", "A# diminished", "B", "C# minor", "D# minor", "E", "F#",
"A", "C", "D", "F", "G"],
// A minor
["A minor", "B diminished", "C", "D minor", "E minor", "F", "G",
"Bb", "Db", "Eb", "Gb", "Ab"],
// Bb minor
["Bb minor", "C diminished", "Db", "Eb minor", "F minor", "Gb", "Ab",
"B", "D", "E", "G", "A"],
// B minor
["B minor", "C# diminished", "D", "E minor", "F# minor", "G", "A",
"C", "Eb", "F", "Ab", "Bb"]
];

const romanNumerals = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const flatRomanNumerals = ['♭II', '♭III', '♭V', '♭VI', '♭VII'];
const minorRomanNumerals = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

const scaleDegrees = ['1', '2', '3', '4', '5', '6', '7'];
const flatScaleDegrees = ['♭2', '♭3', '♭5', '♭6', '♭7'];

// Index mapping for flat questions [♭II, ♭III, ♭V, ♭VI, ♭VII]
const flatDegreeMap = [1, 2, 4, 5, 6]; // Corresponding to indices 7-11 in chords array

function startQuiz() {
    currentQuestion = 0;
    score = 0;
    questions = [];
    userAnswers = [];
    lastDegree = -1;
    lastQuestionType = '';
    
    const scaleType = document.getElementById("scaleType").value;
    const rootNote = document.getElementById("rootNote").selectedIndex;
    const rootNoteName = document.getElementById("rootNote").value;
    const numQuestions = parseInt(document.getElementById("questionCount").value);
    
    if (numQuestions < 10 || numQuestions > 50) {
        alert("Please choose between 10 and 50 questions.");
        return;
    }

    const chords = scaleType === "major" ? majorChords[rootNote] : minorChords[rootNote];
    
    // Generate a pool of question types
    const questionTypes = [
        'chord-roman', // Ask for chord given Roman numeral
        'roman-chord', // Ask for Roman numeral given chord
        'chord-number', // Ask for chord given number
        'number-chord', // Ask for number given chord
        'flat-chord', // Ask for chord given flat notation
        'chord-flat'  // Ask for flat notation given chord
    ];

    // Keep track of used questions to avoid exact repetition
    const usedQuestions = new Set();
    
    // Generate questions
    for (let i = 0; i < numQuestions; i++) {
        let degree, questionType, question, answer;
        let questionKey;
        
        // Try to find a non-repeating question
        // Try to find a non-repeating question
        let attempts = 0;
        do {
            // Avoid using the same degree consecutively
            do {
                degree = Math.floor(Math.random() * 7);
            } while (degree === lastDegree && attempts < 5);
        
            // Avoid using the same question type consecutively
            do {
                questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
            } while (questionType === lastQuestionType && attempts < 5);
        
            // Formulate question based on type
            if (questionType === 'chord-roman') {
                const numerals = scaleType === "major" ? romanNumerals : minorRomanNumerals;
                question = `What is the ${numerals[degree]} chord in ${rootNoteName} ${scaleType}?`;
                answer = chords[degree];
            } else if (questionType === 'roman-chord') {
                const numerals = scaleType === "major" ? romanNumerals : minorRomanNumerals;
                question = `Which degree is ${chords[degree]} in ${rootNoteName} ${scaleType}?`;
                answer = numerals[degree];
            } else if (questionType === 'chord-number') {
                question = `What is the ${degree + 1} chord in ${rootNoteName} ${scaleType}?`;
                answer = chords[degree];
            } else if (questionType === 'number-chord') {
                question = `Which number is ${chords[degree]} in ${rootNoteName} ${scaleType}?`;
                answer = (degree + 1).toString();
            } else if (questionType === 'flat-chord') {
                const flatIndex = Math.floor(Math.random() * flatRomanNumerals.length);
                question = `What is the ${flatRomanNumerals[flatIndex]} chord in ${rootNoteName} ${scaleType}?`;
                answer = chords[7 + flatIndex]; // Flat chords start at index 7
            } else if (questionType === 'chord-flat') {
                // Only use flat chords (indices 7-11)
                const flatIndex = Math.floor(Math.random() * 5);
                const chordIndex = 7 + flatIndex;
                question = `${chords[chordIndex]} is which flat scale degree in ${rootNoteName} ${scaleType}?`;
                answer = flatRomanNumerals[flatIndex];
            }
        
            questionKey = question + "|" + answer;
            attempts++;
        } while (usedQuestions.has(questionKey) && attempts < 10 && usedQuestions.size < questionTypes.length * 7);
        
        usedQuestions.add(questionKey);
        lastDegree = degree;
        lastQuestionType = questionType;
        
        // Generate options based on question type
        let options = [answer];
        let potentialOptions = [];
        
        if (questionType === 'chord-roman' || questionType === 'chord-number') {
            // Options are chords (regular chords only)
            potentialOptions = chords.slice(0, 7); // Only regular chords (indices 0-6)
        } else if (questionType === 'roman-chord') {
            // Options are Roman numerals
            potentialOptions = scaleType === "major" ? [...romanNumerals] : [...minorRomanNumerals];
        } else if (questionType === 'number-chord') {
            // Options are numbers 1-7
            potentialOptions = ['1', '2', '3', '4', '5', '6', '7'];
        } else if (questionType === 'flat-chord') {
            // Options are flat chords only (indices 7-11)
            potentialOptions = chords.slice(7, 12);
        } else if (questionType === 'chord-flat') {
            // Options are flat Roman numerals only
            potentialOptions = [...flatRomanNumerals];
        }
        
        // Remove correct answer from potential options to avoid duplicates
        potentialOptions = potentialOptions.filter(opt => opt !== answer);
        
        // Shuffle and take 2 random incorrect options
        potentialOptions.sort(() => Math.random() - 0.5);
        options = options.concat(potentialOptions.slice(0, 2));
        
        // Shuffle final options
        options.sort(() => Math.random() - 0.5);
        
        questions.push({ question, options, answer });
        userAnswers.push(null);
    }

    // Hide setup, show quiz
    document.getElementById("setup").style.display = "none";
    document.getElementById("quiz").style.display = "block";
    document.getElementById("result").style.display = "none";
    
    // Update question count display
    document.getElementById("totalQuestions").textContent = numQuestions;
    
    showQuestion();
}

function showQuestion() {
    const q = questions[currentQuestion];
    document.getElementById("question").textContent = q.question;
    document.getElementById("currentQuestionNum").textContent = currentQuestion + 1;
    
    const optionsDiv = document.getElementById("options");
    optionsDiv.innerHTML = "";
    
    q.options.forEach(option => {
        const btn = document.createElement("button");
        btn.textContent = option;
        btn.className = "option";
        // If this question has a saved answer, mark it as selected
        if (userAnswers[currentQuestion] === option) {
            btn.classList.add("selected");
        }
        btn.onclick = () => selectAnswer(option);
        optionsDiv.appendChild(btn);
    });
    
    // Show next button if not the last question, otherwise show finish button
    if (currentQuestion === questions.length - 1) {
        document.getElementById("nextButton").style.display = "none";
        document.getElementById("finishButton").style.display = "block";
    } else {
        document.getElementById("nextButton").style.display = "block";
        document.getElementById("finishButton").style.display = "none";
    }
}

function selectAnswer(selectedOption) {
    // Clear all selections
    const options = document.querySelectorAll(".option");
    options.forEach(option => {
        option.classList.remove("selected");
    });
    
    // Mark selected option
    options.forEach(option => {
        if (option.textContent === selectedOption) {
            option.classList.add("selected");
        }
    });
    
    // Save the answer
    userAnswers[currentQuestion] = selectedOption;
}

function nextQuestion() {
    // Only proceed if an answer has been selected
    if (!userAnswers[currentQuestion]) {
        alert("Please select an answer before proceeding.");
        return;
    }
    
    currentQuestion++;
    showQuestion();
}

function finishQuiz() {
    // Make sure the current question has an answer
    if (!userAnswers[currentQuestion]) {
        alert("Please select an answer for the current question.");
        return;
    }
    
    // Check for any unanswered questions
    if (userAnswers.includes(null)) {
        if (!confirm("Some questions haven't been answered. Are you sure you want to finish?")) {
            return;
        }
    }
    
    // Calculate score
    score = 0;
    for (let i = 0; i < questions.length; i++) {
        if (userAnswers[i] === questions[i].answer) {
            score++;
        }
    }
    
    // Hide quiz, show result
    document.getElementById("quiz").style.display = "none";
    const resultDiv = document.getElementById("result");
    resultDiv.style.display = "block";
    
    // Calculate percentage
    const percentage = Math.round((score / questions.length) * 100);
    
    // Build results table
    let resultsTableHTML = `
        <table class="results-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Question</th>
                    <th>Your Answer</th>
                    <th>Correct Answer</th>
                    <th>Result</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (let i = 0; i < questions.length; i++) {
        const isCorrect = userAnswers[i] === questions[i].answer;
        resultsTableHTML += `
            <tr>
                <td>${i + 1}</td>
                <td>${questions[i].question}</td>
                <td>${userAnswers[i] || "Not answered"}</td>
                <td>${questions[i].answer}</td>
                <td style="color: ${isCorrect ? '#2ecc71' : '#e74c3c'}">${isCorrect ? "Correct" : "Incorrect"}</td>
            </tr>
        `;
    }
    
    resultsTableHTML += `
            </tbody>
        </table>
    `;
    
    // Display result
    resultDiv.innerHTML = `
        <h2>Quiz Results</h2>
        <p>You scored <strong>${score}</strong> out of <strong>${questions.length}</strong> questions.</p>
        <p>Your grade: <strong>${percentage}%</strong></p>
        ${resultsTableHTML}
        <button onclick="location.reload()" style="margin-top: 20px;">Try Again</button>
    `;
}