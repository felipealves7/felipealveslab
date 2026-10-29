(() => {
  const video = document.getElementById('intro-video');
  const playButton = document.querySelector('[data-video-control="intro-video"]');
  const soundButton = document.querySelector('[data-sound-control="intro-video"]');
  const maxConsecutivePlays = 2;
  let completedPlays = 0;

  if (video && playButton) {
    const play = () => {
      if (completedPlays >= maxConsecutivePlays) {
        completedPlays = 0;
        video.currentTime = 0;
      }
      video.play().then(() => {
        playButton.hidden = true;
      }).catch(() => {
        playButton.hidden = false;
      });
    };

    playButton.addEventListener('click', play);

    video.addEventListener('click', () => {
      if (!video.paused && !video.ended) {
        video.pause();
        playButton.textContent = 'Resume';
        playButton.hidden = false;
      }
    });

    video.addEventListener('ended', () => {
      completedPlays += 1;
      video.currentTime = 0;
      playButton.textContent = completedPlays >= maxConsecutivePlays ? 'Reset / replay' : 'Replay';
      playButton.hidden = false;
    });

    if (soundButton) {
      soundButton.addEventListener('click', () => {
        video.muted = !video.muted;
        soundButton.textContent = video.muted ? 'Sound off' : 'Sound on';
      });
    }
  }

  const reveals = document.querySelectorAll('.a3-reveal');
  if (!('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  reveals.forEach((el) => observer.observe(el));
})();
