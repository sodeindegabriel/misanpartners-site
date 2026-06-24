// Misan Partners — landing + manifesto behaviour
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal beats as they enter the viewport
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.45 });
    document.querySelectorAll('.beat').forEach(function (b) { io.observe(b); });
  } else {
    document.querySelectorAll('.beat').forEach(function (b) { b.classList.add('in'); });
  }

  // Traveling guide orb: descends with scroll progress
  var guide = document.getElementById('guide');
  if (guide && !reduce) {
    function onScroll() {
      var h = document.documentElement;
      var p = h.scrollTop / ((h.scrollHeight - h.clientHeight) || 1);
      var margin = 60;
      guide.style.top = (margin + p * (window.innerHeight - margin * 2)) + 'px';
      guide.classList.toggle('show', p > 0.02 && p < 0.985);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
