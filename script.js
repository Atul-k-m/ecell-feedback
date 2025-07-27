let questionsData = {};
let currentUserType = '';
let currentQuestionIndex = 0;
let userResponses = {};
let questionFlow = [];
let autoNextTimer = null;
let questionnaireCompleted = false;

// Backend URL configuration
const API_BASE_URL = 'https://ecell-feedback.onrender.com';

// Auto-next delay for multiple choice questions (in milliseconds)
const AUTO_NEXT_DELAY = 150;

// Load questions from JSON file
async function loadQuestions() {
    try {
     const response = await fetch(`${window.location.pathname}questions.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        questionsData = await response.json();
        console.log('Questions loaded successfully');
    } catch (error) {
        console.error('Error loading questions:', error);
        // Fallback questions if JSON file fails to load
        questionsData = {
            stakeholder: {
                year_question: {
                    question: "Which year are you in?",
                    options: ["1st Year", "2nd Year", "3rd Year", "4th Year", "Graduate"]
                },
                role_question: {
                    question: "What is your role with E-Cell BMSIT&M?",
                    options: ["Team Member", "Alumni", "Faculty", "Industry Partner", "Investor"]
                },
                rating_questions: [
                    {
                        question: "How satisfied are you with E-Cell BMSIT&M's current initiatives?",
                        scale: 5,
                        optional: true
                    }
                ],
                open_ended: [
                    {
                        question: "What suggestions do you have for improving E-Cell BMSIT&M?",
                        optional: true
                    }
                ]
            },
            participant: {
                event_question: {
                    question: "Which E-Cell BMSIT&M event did you participate in?",
                    options: ["Workshop", "Seminar", "Competition", "Networking Event", "Other"]
                },
                rating_questions: [
                    {
                        question: "How would you rate your overall experience with E-Cell BMSIT&M?",
                        scale: 5,
                        optional: true
                    }
                ],
                open_ended: [
                    {
                        question: "What did you learn from the E-Cell BMSIT&M event?",
                        optional: true
                    }
                ]
            }
        };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadQuestions();
    
    const card = document.querySelector('.card');
    if (card) {
        setTimeout(() => {
            card.style.animationDelay = '0.2s';
        }, 100);
    }
});

function validateName() {
    const nameInput = document.getElementById('nameInput');
    const nameError = document.getElementById('nameError');
    
    if (nameInput && nameInput.value.trim() === '') {
        if (nameError) {
            nameError.style.display = 'block';
            nameError.textContent = 'Please enter your name';
        }
        return false;
    }
    
    if (nameError) nameError.style.display = 'none';
    return true;
}

function startQuestionnaire(userType) {
    // Check if questionnaire is already completed
    if (questionnaireCompleted) {
        console.log('Questionnaire already completed');
        return;
    }
    
    if (!validateName()) return;
    
    const nameInput = document.getElementById('nameInput');
    const userName = nameInput ? nameInput.value.trim() : '';
    
    currentUserType = userType;
    userResponses = { 
        userType: userType,
        name: userName
    };
    currentQuestionIndex = 0;
    
    // Build question flow
    questionFlow = [];
    
    if (userType === 'stakeholder') {
        if (questionsData.stakeholder?.year_question) {
            questionFlow.push({ type: 'year', data: questionsData.stakeholder.year_question });
        }
        if (questionsData.stakeholder?.role_question) {
            questionFlow.push({ type: 'role', data: questionsData.stakeholder.role_question });
        }
        if (questionsData.stakeholder?.rating_questions) {
            questionsData.stakeholder.rating_questions.forEach(q => {
                questionFlow.push({ type: 'rating', data: q });
            });
        }
        if (questionsData.stakeholder?.open_ended) {
            questionsData.stakeholder.open_ended.forEach(q => {
                questionFlow.push({ type: 'text', data: q });
            });
        }
    } else {
        if (questionsData.participant?.event_question) {
            questionFlow.push({ type: 'event', data: questionsData.participant.event_question });
        }
        if (questionsData.participant?.rating_questions) {
            questionsData.participant.rating_questions.forEach(q => {
                questionFlow.push({ type: 'rating', data: q });
            });
        }
        if (questionsData.participant?.open_ended) {
            questionsData.participant.open_ended.forEach(q => {
                questionFlow.push({ type: 'text', data: q });
            });
        }
    }
    
    // Hide welcome screen and show question container
    const welcomeScreen = document.getElementById('welcomeScreen');
    const questionContainer = document.getElementById('questionContainer');
    
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
        welcomeScreen.classList.add('hidden');
    }
    if (questionContainer) {
        questionContainer.style.display = 'block';
        questionContainer.classList.add('active');
    }
    
    showQuestion();
}

function showQuestion() {
    if (currentQuestionIndex >= questionFlow.length) {
        finishQuestionnaire();
        return;
    }

    const currentQ = questionFlow[currentQuestionIndex];
    const questionText = document.getElementById('questionText');
    const optionsContainer = document.getElementById('optionsContainer');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const skipBtn = document.getElementById('skipBtn');

    if (questionText) questionText.textContent = currentQ.data.question;
    if (optionsContainer) optionsContainer.innerHTML = '';
    
    // Clear any existing auto-next timer
    if (autoNextTimer) {
        clearTimeout(autoNextTimer);
        autoNextTimer = null;
    }

    // Update navigation buttons
    if (prevBtn) prevBtn.disabled = currentQuestionIndex === 0;
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = currentQuestionIndex === questionFlow.length - 1 ? 'Finish' : 'Next';
    }
    
    // Show/hide skip button for optional questions
    const isOptional = currentQ.data.optional === true;
    if (skipBtn) {
        skipBtn.style.display = isOptional ? 'inline-block' : 'none';
    }

    // Update progress
    const progress = ((currentQuestionIndex) / questionFlow.length) * 100;
    const progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = progress + '%';

    if (currentQ.type === 'rating') {
        showRatingQuestion(currentQ.data);
    } else if (currentQ.type === 'text') {
        showTextQuestion(currentQ.data);
    } else {
        showMultipleChoiceQuestion(currentQ.data);
    }
}

function showMultipleChoiceQuestion(questionData) {
    const optionsContainer = document.getElementById('optionsContainer');
    if (!optionsContainer || !questionData.options) return;
    
    questionData.options.forEach((option, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option';
        optionDiv.textContent = option;
        optionDiv.onclick = () => selectOption(optionDiv, option, true); // Enable auto-next
        optionsContainer.appendChild(optionDiv);
    });
}

function showRatingQuestion(questionData) {
    const optionsContainer = document.getElementById('optionsContainer');
    if (!optionsContainer) return;
    
    const ratingContainer = document.createElement('div');
    ratingContainer.className = 'rating-container';
    
    const scale = questionData.scale || 5;
    for (let i = 1; i <= scale; i++) {
        const ratingOption = document.createElement('div');
        ratingOption.className = 'rating-option';
        ratingOption.textContent = i;
        ratingOption.onclick = () => selectRating(ratingOption, i, questionData.optional !== true);
        ratingContainer.appendChild(ratingOption);
    }
    
    const labelsDiv = document.createElement('div');
    labelsDiv.className = 'rating-labels';
    labelsDiv.innerHTML = '<span>Strongly Disagree</span><span>Strongly Agree</span>';
    
    optionsContainer.appendChild(ratingContainer);
    optionsContainer.appendChild(labelsDiv);
}

function showTextQuestion(questionData) {
    const optionsContainer = document.getElementById('optionsContainer');
    const nextBtn = document.getElementById('nextBtn');
    if (!optionsContainer) return;
    
    const textarea = document.createElement('textarea');
    textarea.className = 'textarea';
    textarea.placeholder = 'Please share your thoughts here...';
    textarea.style.width = '100%';
    textarea.style.minHeight = '120px';
    textarea.style.padding = '12px';
    textarea.style.border = '2px solid #e0e0e0';
    textarea.style.borderRadius = '8px';
    textarea.style.fontSize = '14px';
    textarea.style.resize = 'vertical';
    
    // For optional questions, enable next button immediately
    if (questionData.optional === true && nextBtn) {
        nextBtn.disabled = false;
    }
    
    textarea.oninput = () => {
        if (nextBtn) {
            // For required questions, check if text is entered
            if (questionData.optional !== true) {
                nextBtn.disabled = textarea.value.trim() === '';
            }
        }
        userResponses[`question_${currentQuestionIndex}`] = textarea.value;
    };
    
    optionsContainer.appendChild(textarea);
}

function selectOption(element, value, enableAutoNext = false) {
    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.disabled = false;
    
    userResponses[`question_${currentQuestionIndex}`] = value;
    
    // Auto-next for multiple choice questions
    if (enableAutoNext) {
        autoNextTimer = setTimeout(() => {
            nextQuestion();
        }, AUTO_NEXT_DELAY);
    }
}

function selectRating(element, value, enableAutoNext = false) {
    document.querySelectorAll('.rating-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.disabled = false;
    
    userResponses[`question_${currentQuestionIndex}`] = value;
    
    // Auto-next for rating questions
    if (enableAutoNext) {
        autoNextTimer = setTimeout(() => {
            nextQuestion();
        }, AUTO_NEXT_DELAY);
    }
}

function nextQuestion() {
    // Clear any existing auto-next timer
    if (autoNextTimer) {
        clearTimeout(autoNextTimer);
        autoNextTimer = null;
    }
    
    if (currentQuestionIndex >= questionFlow.length - 1) {
        finishQuestionnaire();
        return;
    }
    
    currentQuestionIndex++;
    animateTransition('next');
}

function previousQuestion() {
    // Clear any existing auto-next timer
    if (autoNextTimer) {
        clearTimeout(autoNextTimer);
        autoNextTimer = null;
    }
    
    if (currentQuestionIndex <= 0) return;
    
    currentQuestionIndex--;
    animateTransition('prev');
}

function skipQuestion() {
    // Clear any existing auto-next timer
    if (autoNextTimer) {
        clearTimeout(autoNextTimer);
        autoNextTimer = null;
    }
    
    // Remove response for skipped question
    delete userResponses[`question_${currentQuestionIndex}`];
    
    if (currentQuestionIndex >= questionFlow.length - 1) {
        finishQuestionnaire();
        return;
    }
    
    currentQuestionIndex++;
    animateTransition('next');
}

function animateTransition(direction) {
    const container = document.getElementById('questionContainer');
    if (!container) {
        showQuestion();
        return;
    }
    
    // Add slide-out animation
    if (direction === 'next') {
        container.classList.add('slide-out-left');
    } else {
        container.classList.add('slide-out-right');
    }
    
    setTimeout(() => {
        // Remove slide-out classes and show new question
        container.classList.remove('slide-out-left', 'slide-out-right');
        showQuestion();
        
        // Ensure the container is visible and animated in
        container.style.opacity = '1';
        container.style.transform = 'translateX(0)';
    }, 250);
}

async function finishQuestionnaire() {
    // Clear any existing auto-next timer
    if (autoNextTimer) {
        clearTimeout(autoNextTimer);
        autoNextTimer = null;
    }
    
    // Prepare data for submission
    const surveyData = {
        timestamp: new Date().toISOString(),
        ...userResponses
    };
    
    console.log('Submitting survey data:', surveyData);
    
    try {
        // Send data to backend
        const response = await fetch(`${API_BASE_URL}/api/submit-survey`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(surveyData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Survey submitted successfully:', result);
        } else {
            const errorText = await response.text();
            console.error('Error submitting survey:', response.status, errorText);
            alert('There was an error submitting your survey. Please try again.');
            return;
        }
    } catch (error) {
        console.error('Network error:', error);
        alert('Unable to connect to the server. Please check your connection and try again.');
        return;
    }
    
    // Get all screen elements
    const welcomeScreen = document.getElementById('welcomeScreen');
    const questionContainer = document.getElementById('questionContainer');
    const thankYouScreen = document.getElementById('thankYouScreen');
    
    // FIXED: Ensure welcome screen stays completely hidden
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
        welcomeScreen.classList.add('hidden');
        welcomeScreen.classList.remove('active'); // Remove any active class
    }
    
    // Hide question container with animation
    if (questionContainer) {
        questionContainer.classList.remove('active');
        questionContainer.classList.add('slide-out-left');
        questionContainer.style.display = 'none'; // Explicitly hide
    }
    
    // Show thank you screen after animation
    setTimeout(() => {
        if (thankYouScreen) {
            thankYouScreen.style.display = 'block';
            thankYouScreen.classList.add('active');
            thankYouScreen.classList.remove('hidden'); // Ensure it's not hidden
        }
        
        // Complete progress bar
        const progressFill = document.getElementById('progressFill');
        if (progressFill) progressFill.style.width = '100%';
        
        // Mark questionnaire as completed to prevent restart
        markQuestionnaireCompleted();
    }, 250);
}

// Mark questionnaire as completed
function markQuestionnaireCompleted() {
    questionnaireCompleted = true;
    
    // Disable all navigation to prevent accidental resets
    const userTypeBtns = document.querySelectorAll('.user-type-btn');
    userTypeBtns.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.onclick = null; // Remove click handlers
    });
    
    // Disable name input
    const nameInput = document.getElementById('nameInput');
    if (nameInput) {
        nameInput.disabled = true;
        nameInput.style.opacity = '0.5';
    }
    
    // Ensure welcome screen cannot reappear
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none !important';
        welcomeScreen.classList.add('hidden');
    }
}

// Keyboard navigation support
document.addEventListener('keydown', function(event) {
    const questionContainer = document.getElementById('questionContainer');
    if (!questionContainer || !questionContainer.classList.contains('active')) return;
    
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const skipBtn = document.getElementById('skipBtn');
    
    switch(event.key) {
        case 'ArrowRight':
        case 'Enter':
            if (nextBtn && !nextBtn.disabled) {
                event.preventDefault();
                nextQuestion();
            }
            break;
        case 'ArrowLeft':
            if (prevBtn && !prevBtn.disabled) {
                event.preventDefault();
                previousQuestion();
            }
            break;
        case 'Escape':
            if (skipBtn && skipBtn.style.display !== 'none') {
                event.preventDefault();
                skipQuestion();
            }
            break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
            // Quick rating selection with number keys
            const ratingOptions = document.querySelectorAll('.rating-option');
            const ratingIndex = parseInt(event.key) - 1;
            if (ratingOptions[ratingIndex]) {
                event.preventDefault();
                ratingOptions[ratingIndex].click();
            }
            break;
    }
});

// Prevent accidental page refresh during questionnaire
window.addEventListener('beforeunload', function(event) {
    const questionContainer = document.getElementById('questionContainer');
    if (questionContainer && questionContainer.classList.contains('active')) {
        event.preventDefault();
        event.returnValue = 'Are you sure you want to leave? Your progress will be lost.';
        return event.returnValue;
    }
});

// Auto-save responses to prevent data loss
function autoSaveResponses() {
    if (Object.keys(userResponses).length > 0) {
        try {
            // Note: In production, you might want to save to a temporary backend endpoint
            console.log('Auto-saving responses:', userResponses);
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }
}

// Auto-save every 30 seconds
setInterval(autoSaveResponses, 30000);