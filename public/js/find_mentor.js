document.getElementById('findMentorBtn').addEventListener('click', () => {
    document.getElementById('mentorModal').classList.remove('hidden');
});

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('mentorModal').classList.add('hidden');
});

document.getElementById('mentorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    alert('Thank you! We are finding the perfect mentor for you.');
    document.getElementById('mentorModal').classList.add('hidden');
});
