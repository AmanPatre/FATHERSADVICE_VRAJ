document.getElementById('findMentorBtn').addEventListener('click', () => {
    document.getElementById('mentorModal').classList.remove('hidden');
});

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('mentorModal').classList.add('hidden');
});

<<<<<<< HEAD
document.getElementById('mentorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    alert('Thank you! We are finding the perfect mentor for you.');
=======
document.getElementById('mentorForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const doubt = formData.get('doubt');
    
    try {
        const response = await fetch('/find-mentor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Include cookies in the request
            body: JSON.stringify({ doubt })
        });
        
        if (response.ok) {
            window.location.href = '/mentor-match-results';
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to find mentor');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while finding a mentor');
    }
    
>>>>>>> 1278ab0 (Initial commit)
    document.getElementById('mentorModal').classList.add('hidden');
});
