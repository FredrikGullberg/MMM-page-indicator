Module.register('MMM-page-indicator', {

  /**
   * By default, we should try to make the configuration match the demo
   * implementation. This means 3 pages, and some default enabled styles.
   */
  defaults: {
    pages: 3,
    activeBright: false,
    inactiveDimmed: true,
    inactiveHollow: true,
    showPageNumberOnHover: true,
    // Ring around the active page that fills until MMM-pages changes page,
    // and a pause symbol while rotation is paused. Needs MMM-pages with
    // PAGE_TIMING support.
    timerRing: false,
  },

  /**
   * Apply any styles, if we have any.
   */
  getStyles() {
    return ['font-awesome.css', 'page-indicators.css'];
  },

  /**
   * Pseudo-constructor for our module. Sets the default current page to 0.
   */
  start() {
    this.curPage = 0;
    this.mmmPagesDetected = false;
    this.timing = null;
  },

  /**
   * Store PAGE_TIMING from MMM-pages. Returns false for an invalid payload.
   * @param {object} payload { page, duration, remaining, paused }
   * @returns {boolean} Whether the payload was accepted.
   */
  setTiming(payload) {
    const valid = payload && Number.isInteger(payload.page)
      && Number.isFinite(payload.duration) && payload.duration >= 0
      && Number.isFinite(payload.remaining) && payload.remaining >= 0;
    if (!valid) return false;
    this.timing = {
      page: payload.page,
      duration: payload.duration,
      remaining: Math.min(payload.remaining, payload.duration),
      paused: payload.paused === true,
      receivedAt: Date.now(),
    };
    return true;
  },

  /**
   * Ring for the active page: an SVG circle whose stroke fills via CSS from
   * the elapsed time, so a re-render continues where it was instead of restarting.
   * @returns {SVGElement|null} The ring, or null when no ring should show.
   */
  createTimerRing() {
    const timing = this.timing;
    if (!this.config.timerRing || !timing || timing.page !== this.curPage) return null;
    if (!timing.paused && !(timing.duration > 0)) return null;
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', `timer-ring${timing.paused ? ' timer-ring-paused' : ''}`);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(svgNs, 'circle');
    track.setAttribute('class', 'timer-ring-track');
    const arc = document.createElementNS(svgNs, 'circle');
    arc.setAttribute('class', 'timer-ring-arc');
    for (const circle of [track, arc]) {
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '10');
      circle.setAttribute('pathLength', '100');
    }
    svg.appendChild(track);
    if (!timing.paused) {
      const elapsed = timing.duration - timing.remaining + (Date.now() - timing.receivedAt);
      arc.style.setProperty('--ring-duration', `${timing.duration}ms`);
      arc.style.setProperty('--ring-elapsed', `${Math.min(Math.max(elapsed, 0), timing.duration)}ms`);
      svg.appendChild(arc);
    }
    return svg;
  },

  /**
   * Render the circles for each page, and highlighting the page we're on.
   */
  getDom() {
    const wrapper = document.createElement('div');

    for (let i = 0; i < this.config.pages; i += 1) {
      Log.debug(`[${this.name}]: Adding circle for page ${i} of ${this.config.pages - 1}`);
      const circleWrapper = document.createElement('div');
      circleWrapper.classList.add('circle-wrapper');

      const circle = document.createElement('i');
      circle.classList.add('fa', 'indicator', `page-${i}`);
      circle.setAttribute('role', 'button');
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('aria-label', `Page ${i + 1}`);

      const paused = this.config.timerRing && this.timing?.paused && this.timing.page === i;
      if (this.curPage === i) {
        circle.classList.add(paused ? 'fa-pause' : 'fa-circle', 'active-page');
        if (paused) circle.setAttribute('aria-label', `Page ${i + 1}, rotation paused`);
        circle.setAttribute('aria-current', 'page');
        if (this.config.activeBright) circle.classList.add('bright');
      }
      else {
        if (this.config.inactiveDimmed) circle.classList.add('dimmed');

        if (this.config.inactiveHollow) {
          circle.classList.add('fa-circle-thin');
        }
        else {
          circle.classList.add('fa-circle');
        }
      }

      const tooltip = document.createElement('span');
      tooltip.classList.add('tooltip');
      tooltip.innerText = String(i);

      // Lets people change the page by clicking on the respective circle.
      // sendNotification triggers notificationReceived which calls updateDom.
      circle.onclick = () => {
        this.sendNotification('PAGE_SELECT', i);
      };
      circle.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.sendNotification('PAGE_SELECT', i);
        }
      };

      circleWrapper.appendChild(circle);
      if (this.curPage === i) {
        const ring = this.createTimerRing();
        if (ring) {
          circleWrapper.classList.add('has-timer-ring');
          circleWrapper.appendChild(ring);
        }
      }
      if (this.config.showPageNumberOnHover) circleWrapper.appendChild(tooltip);
      wrapper.appendChild(circleWrapper);
    }

    return wrapper;
  },

  /**
   * If we receive a notification that we can respond to, update which page
   * we're suppose to show as active.
   * @param {string} notification The notification ID
   * @param {number} payload the payload type.
   */
  notificationReceived(notification, payload) {
    /**
     * Modulo that also works with negative numbers.
     * @param {number} x The dividend
     * @param {number} n The divisor
     */
    const mod = (x, n) => ((x % n) + n) % n;

    switch (notification) {
      case 'PAGE_CHANGED':
        Log.warn(`[${this.name}]: The notification "PAGE_CHANGED" is deprecated. Please use "PAGE_SELECT" instead.`);
        // falls through
      case 'PAGE_SELECT':
        if (typeof payload === 'number' && !Number.isNaN(payload)) {
          Log.log(`[${this.name}]: changing pages to ${payload}`);
          this.curPage = mod(payload, this.config.pages);
          this.updateDom();
        }
        else {
          Log.warn(`[${this.name}]: Invalid payload for PAGE_SELECT: ${payload}`);
        }
        break;

      case 'MAX_PAGES_CHANGED':
        // Validate payload is a positive integer
        if (Number.isInteger(payload) && payload > 0) {
          Log.log(`[${this.name}]: Changing maximum pages to ${payload}`);
          this.config.pages = payload;
          if (payload - 1 < this.curPage) {
            this.curPage = payload - 1;
          }
          this.updateDom();
        }
        else {
          Log.warn(`[${this.name}]: Invalid payload for MAX_PAGES_CHANGED: ${payload}`);
        }
        break;

      case 'PAGE_INCREMENT':
        if (!this.mmmPagesDetected) {
          this.curPage = mod(this.curPage + 1, this.config.pages);
          Log.log(`[${this.name}]: Incrementing page; new page is ${this.curPage}`);
          this.updateDom();
        }
        break;

      case 'PAGE_DECREMENT':
        if (!this.mmmPagesDetected) {
          this.curPage = mod(this.curPage - 1, this.config.pages);
          Log.log(`[${this.name}]: Decrementing page; new page is ${this.curPage}`);
          this.updateDom();
        }
        break;

      case 'NEW_PAGE':
        if (typeof payload === 'number' && !Number.isNaN(payload)) {
          Log.log(`[${this.name}]: Setting page to ${payload}`);
          this.curPage = payload;
          this.updateDom();
        }
        else {
          Log.warn(`[${this.name}]: Invalid payload for NEW_PAGE: ${payload}`);
        }
        break;

      case 'PAGE_TIMING':
        if (!this.config.timerRing) break;
        if (this.setTiming(payload)) {
          this.updateDom();
        }
        else {
          Log.warn(`[${this.name}]: Invalid payload for PAGE_TIMING: ${JSON.stringify(payload)}`);
        }
        break;

      case 'DOM_OBJECTS_CREATED':
        // MMM-pages may have announced the first page before we listened.
        if (this.config.timerRing) this.sendNotification('QUERY_PAGE_TIMING');
        break;

      case 'ALL_MODULES_STARTED':
        this.mmmPagesDetected = MM.getModules().withClass('MMM-pages').length > 0;
        Log.log(`[${this.name}]: MMM-pages detected. Will ignore PAGE_INCREMENT and PAGE_DECREMENT as it is already handled by MMM-pages`);
        break;
    }
  },

});
