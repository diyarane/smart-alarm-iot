class SmartAlarm {
    constructor() {
        this.debounceTimers = {};
        this.activeRequests = {};
        this.lastCalculation = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setDefaultTimes();
        this.setupVisualControls();
        console.log("Smart Alarm initialized");
    }

    setDefaultTimes() {
        // Set arrival time to next hour by default
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        const timeString = now.toTimeString().substring(0, 5);
        document.getElementById('arrival_time').value = timeString;
        const daySelect = document.getElementById('selected_day');
        if (daySelect) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            daySelect.value = days[new Date().getDay()];
        }
        console.log("Set default arrival time to:", timeString);
    }

    setupEventListeners() {
        // Autocomplete for start location
        document.getElementById('start_place').addEventListener('input', (e) => {
            this.handleAutocomplete(e.target.value, 'start');
        });

        // Autocomplete for destination
        document.getElementById('end_place').addEventListener('input', (e) => {
            this.handleAutocomplete(e.target.value, 'end');
        });

        // Form submission
        document.getElementById('alarmForm').addEventListener('submit', (e) => {
            this.handleSubmit(e);
        });

        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.matches('.autocomplete-container input')) {
                this.hideAllSuggestions();
            }
        });

        // Keyboard navigation
        this.setupKeyboardNavigation();

        // Geolocation buttons
        document.querySelectorAll('.location-btn').forEach(button => {
            button.addEventListener('click', () => {
                const target = button.getAttribute('data-target');
                this.handleUseMyLocation(target, button);
            });
        });
        
        console.log("Event listeners setup complete");
    }

    setupVisualControls() {
        const readyInput = document.getElementById('getting_ready');
        const readySlider = document.getElementById('getting_ready_slider');
        const bufferSlider = document.getElementById('bufferSlider');
        const bufferInput = document.getElementById('bufferInput');
        const bufferValue = document.getElementById('bufferValue');
        const arrivalInput = document.getElementById('arrival_time');
        const daySelect = document.getElementById('selected_day');
        const bufferInfoToggle = document.getElementById('bufferInfoToggle');
        const bufferInfoPanel = document.getElementById('bufferInfoPanel');
        const bufferInfoTooltip = document.getElementById('bufferInfoTooltip');

        if (readyInput && readySlider) {
            const syncValue = (value) => {
                const normalized = Math.min(240, Math.max(1, Number(value) || 1));
                readyInput.value = normalized;
                readySlider.value = normalized;
                this.refreshDerivedResults();
            };

            syncValue(readyInput.value || readySlider.value);
            readySlider.addEventListener('input', () => syncValue(readySlider.value));
            readyInput.addEventListener('input', () => syncValue(readyInput.value));
        }

        if (bufferSlider && bufferValue && bufferInput) {
            const updateBuffer = () => {
                bufferValue.textContent = `${bufferSlider.value} min`;
                bufferInput.value = bufferSlider.value;
                this.refreshDerivedResults();
            };
            const updateFromInput = () => {
                const value = Math.min(60, Math.max(0, Number(bufferInput.value) || 0));
                bufferInput.value = value;
                bufferSlider.value = value;
                bufferValue.textContent = `${value} min`;
                this.refreshDerivedResults();
            };
            updateFromInput();
            bufferSlider.addEventListener('input', updateBuffer);
            bufferInput.addEventListener('input', updateFromInput);
            bufferInput.addEventListener('change', updateFromInput);
        }

        if (arrivalInput) {
            const trafficIndicator = document.getElementById('trafficIndicator');
            const updateTraffic = () => {
                if (!trafficIndicator || !arrivalInput.value) return;
                const { trafficBuffer } = this.getTrafficBufferRules(
                    daySelect?.value,
                    arrivalInput.value,
                    document.getElementById('start_place')?.value,
                    document.getElementById('end_place')?.value
                );
                trafficIndicator.textContent = trafficBuffer >= 15
                    ? '🔴 Heavy traffic confidence'
                    : trafficBuffer >= 8
                        ? '🟡 Moderate traffic confidence'
                        : '🟢 Light traffic confidence';
                this.refreshDerivedResults();
            };
            updateTraffic();
            arrivalInput.addEventListener('change', updateTraffic);
            arrivalInput.addEventListener('input', updateTraffic);
            daySelect?.addEventListener('change', updateTraffic);
        }

        document.getElementById('start_place')?.addEventListener('input', () => this.refreshDerivedResults());
        document.getElementById('end_place')?.addEventListener('input', () => this.refreshDerivedResults());
        document.getElementById('current_alarm')?.addEventListener('input', () => this.refreshDerivedResults());

        if (bufferInfoToggle && bufferInfoPanel && bufferInfoTooltip) {
            const openTooltip = () => {
                bufferInfoTooltip.classList.add('open');
                bufferInfoToggle.setAttribute('aria-expanded', 'true');
            };
            const closeTooltip = () => {
                bufferInfoTooltip.classList.remove('open');
                bufferInfoToggle.setAttribute('aria-expanded', 'false');
            };
            bufferInfoToggle.addEventListener('click', () => {
                if (bufferInfoTooltip.classList.contains('open')) {
                    closeTooltip();
                } else {
                    openTooltip();
                }
            });
            bufferInfoToggle.addEventListener('mouseenter', openTooltip);
            bufferInfoToggle.addEventListener('mouseleave', closeTooltip);
        }
    }

    async handleUseMyLocation(targetInputId, button) {
        if (!navigator.geolocation) {
            this.showAlert('Geolocation is not supported by this browser.');
            return;
        }
        const targetInput = document.getElementById(targetInputId);
        if (!targetInput || !button) return;

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Locating...';

        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude.toFixed(5);
            const lng = position.coords.longitude.toFixed(5);
            const latLngValue = `${lat}, ${lng}`;

            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
                if (!response.ok) throw new Error('Reverse geocode failed');
                const data = await response.json();
                targetInput.value = data.display_name || latLngValue;
            } catch (err) {
                targetInput.value = latLngValue;
                console.warn('Reverse geocoding unavailable:', err);
            } finally {
                button.disabled = false;
                button.textContent = originalText;
            }
        }, (error) => {
            button.disabled = false;
            button.textContent = originalText;
            if (error.code === error.PERMISSION_DENIED) {
                this.showAlert('Location access denied. Please enable location permission.', 'error');
            } else {
                this.showAlert('Unable to fetch your location. Please try again.', 'error');
            }
        });
    }

    getTrafficBufferRules(selectedDay, arrivalTime, startPlace = '', endPlace = '') {
        const rules = [];
        if (!arrivalTime) return { trafficBuffer: 0, rules };
        const [hour, minute] = arrivalTime.split(':').map(Number);
        const totalMinutes = hour * 60 + minute;
        const day = selectedDay || 'Sunday';
        let trafficBuffer = 0;

        const isWeekday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day);
        const addRule = (label, min, max) => {
            const spread = max - min;
            const step = spread === 0 ? 0 : (minute % (spread + 1));
            const value = min + step;
            rules.push(`${label}: +${value} min`);
            return value;
        };

        if (day === 'Sunday') {
            rules.push('Sunday: +0 min');
            return { trafficBuffer, rules };
        }

        if (isWeekday && totalMinutes >= 480 && totalMinutes <= 630) {
            trafficBuffer += addRule(`${day} 8-10 AM office rush`, 15, 25);
        }

        if (isWeekday && totalMinutes >= 1050 && totalMinutes <= 1170) {
            trafficBuffer += addRule(`${day} evening rush (5-7pm)`, 12, 20);
        }

        if (day === 'Saturday' && totalMinutes >= 600 && totalMinutes <= 780) {
            trafficBuffer += addRule('Saturday shopping rush', 8, 12);
        }

        const startNorm = (startPlace || '').toLowerCase();
        const endNorm = (endPlace || '').toLowerCase();
        if (startNorm.includes('viman') && endNorm.includes('kothrud')) {
            trafficBuffer += 5;
            rules.push('Viman Nagar → Kothrud route: +5 min');
        }

        if (rules.length === 0) {
            rules.push(`${day}: +0 min`);
        }

        return { trafficBuffer, rules };
    }

    toMinutes(timeString) {
        const [h, m] = timeString.split(':').map(Number);
        return h * 60 + m;
    }

    toTime(minutes) {
        const normalized = ((minutes % 1440) + 1440) % 1440;
        const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
        const mm = String(normalized % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    refreshDerivedResults() {
        if (!this.lastCalculation) return;

        const resultDiv = document.getElementById('result');
        const arrivalTime = document.getElementById('arrival_time').value || this.lastCalculation.arrival_time;
        const gettingReady = Number(document.getElementById('getting_ready').value || this.lastCalculation.getting_ready || 0);
        const safetyBuffer = Number(document.getElementById('bufferSlider').value || 0);
        const selectedDay = document.getElementById('selected_day')?.value;
        const travelTime = Number(this.lastCalculation.eta || 0);
        const { trafficBuffer, rules } = this.getTrafficBufferRules(
            selectedDay,
            arrivalTime,
            document.getElementById('start_place')?.value,
            document.getElementById('end_place')?.value
        );

        const totalBuffer = travelTime + safetyBuffer + trafficBuffer;
        const departBy = this.toTime(this.toMinutes(arrivalTime) - totalBuffer);
        const alarmTime = this.toTime(this.toMinutes(arrivalTime) - (gettingReady + totalBuffer));

        this.renderResult({
            arrivalTime,
            gettingReady,
            travelTime,
            safetyBuffer,
            trafficBuffer,
            totalBuffer,
            departBy,
            alarmTime,
            currentAlarm: document.getElementById('current_alarm').value || this.lastCalculation.current_alarm,
            rules
        });

        resultDiv.style.display = 'block';
        this.scheduleAlarm(alarmTime);
    }

    renderResult(payload) {
        const resultDiv = document.getElementById('result');
        const rulesList = document.getElementById('bufferRulesList');
        const breakdown = document.getElementById('bufferBreakdown');

        let comparisonHtml = '';
        if (payload.currentAlarm) {
            comparisonHtml = `
                <div class="time-comparison">
                    <div class="time-box current">
                        <div>Current Alarm</div>
                        <div class="time-value">${payload.currentAlarm}</div>
                    </div>
                    <div class="time-box new">
                        <div>Recommended Alarm</div>
                        <div class="time-value">${payload.alarmTime}</div>
                    </div>
                </div>
            `;
        }

        resultDiv.innerHTML = `
            <div class="result-item compact-item">
                <div class="result-label"><i class="fas fa-flag-checkered"></i> Arrival Time</div>
                <div class="result-value">${payload.arrivalTime}</div>
            </div>
            <div class="result-item compact-item">
                <div class="result-label"><i class="fas fa-sign-out-alt"></i> Depart by</div>
                <div class="result-value">${payload.departBy}</div>
            </div>
            <div class="total-buffer-hero">
                <div class="total-buffer-label">TOTAL EXTRA TIME</div>
                <div class="total-buffer-value">${payload.totalBuffer}</div>
                <div class="total-buffer-unit">minutes of extra buffer</div>
                <div class="total-buffer-formula">Travel (${payload.travelTime}) + Safety (${payload.safetyBuffer}) + Traffic (${payload.trafficBuffer}) = ${payload.totalBuffer}</div>
            </div>
            ${comparisonHtml}
            <div class="final-alarm">
                <div class="result-label"><i class="fas fa-bell"></i> SET YOUR ALARM FOR</div>
                <div class="result-value">${payload.alarmTime}</div>
            </div>
            <div class="result-item">
                <div class="result-label"><i class="fas fa-car"></i> Travel Time</div>
                <div class="result-value travel-secondary">${payload.travelTime} minutes</div>
            </div>
            <div class="result-item">
                <div class="result-label"><i class="fas fa-user-pen"></i> Safety Buffer <i class="fas fa-pen"></i></div>
                <div class="result-value safety-secondary">${payload.safetyBuffer} minutes</div>
            </div>
            <div class="result-item">
                <div class="result-label"><i class="fas fa-shield-alt"></i> Safety Buffer</div>
                <div class="result-value safety-secondary">${payload.safetyBuffer + payload.trafficBuffer} minutes total</div>
            </div>
        `;

        if (rulesList) {
            const fullRules = [...payload.rules, `Safety buffer (user set): +${payload.safetyBuffer} min`];
            rulesList.innerHTML = fullRules.map(rule => `<li>${rule}</li>`).join('');
        }
        if (breakdown) {
            breakdown.textContent = `${payload.travelTime} (Travel Time) + ${payload.safetyBuffer} (Safety Buffer) + ${payload.trafficBuffer} (Traffic Buffer) = ${payload.totalBuffer} (Total Buffer extra time)`;
        }
        const tooltipText = document.getElementById('bufferTooltipText');
        if (tooltipText) {
            tooltipText.textContent = `Travel Time: ${payload.travelTime} minutes (based on route), Safety Buffer: ${payload.safetyBuffer} minutes (user set), Traffic Buffer: ${payload.trafficBuffer} minutes (based on day + time rules), Total Buffer: ${payload.totalBuffer} minutes`;
        }
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            if (!activeElement.matches('#start_place, #end_place')) return;

            const fieldType = activeElement.id === 'start_place' ? 'start' : 'end';
            const suggestions = document.getElementById(`${fieldType}_suggestions`);
            const items = suggestions.querySelectorAll('li');
            
            if (items.length === 0) return;

            const activeIndex = Array.from(items).findIndex(item => 
                item.classList.contains('active'));

            let newIndex = -1;

            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (activeIndex >= 0) {
                        items[activeIndex].click();
                    }
                    return;
                case 'Escape':
                    this.hideSuggestions(fieldType);
                    return;
            }

            if (newIndex >= 0) {
                items.forEach(item => item.classList.remove('active'));
                items[newIndex].classList.add('active');
            }
        });
    }

    handleAutocomplete = this.debounce((query, fieldType) => {
        console.log(`Autocomplete for ${fieldType}:`, query);
        this.fetchSuggestions(query, fieldType);
    }, 300);

    debounce(func, delay) {
        return (...args) => {
            clearTimeout(this.debounceTimers[func]);
            this.debounceTimers[func] = setTimeout(() => func.apply(this, args), delay);
        };
    }

    async fetchSuggestions(query, fieldType) {
        if (!query || query.length < 2) {
            this.hideSuggestions(fieldType);
            return;
        }

        // Cancel previous request for this field
        if (this.activeRequests[fieldType]) {
            this.activeRequests[fieldType].abort();
            console.log(`Cancelled previous ${fieldType} request`);
        }

        try {
            this.showLoading(fieldType);
            
            const controller = new AbortController();
            this.activeRequests[fieldType] = controller;

            console.log(`Fetching suggestions for ${fieldType}:`, query);
            const response = await fetch(`/autocomplete?q=${encodeURIComponent(query)}`, {
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const suggestions = await response.json();
            console.log(`Received ${suggestions.length} suggestions for ${fieldType}`);
            this.displaySuggestions(suggestions, fieldType);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`Request aborted for ${fieldType}`);
            } else {
                console.error(`Error fetching ${fieldType} suggestions:`, error);
                this.showAlert('Failed to fetch location suggestions. Please try again.', 'error');
                this.hideSuggestions(fieldType);
            }
        } finally {
            delete this.activeRequests[fieldType];
        }
    }

    displaySuggestions(suggestions, fieldType) {
        const listId = `${fieldType}_suggestions`;
        const list = document.getElementById(listId);
        
        if (!suggestions || suggestions.length === 0) {
            list.innerHTML = '<li class="no-results">No locations found</li>';
            list.style.display = 'block';
            return;
        }

        list.innerHTML = suggestions.map(place => `
            <li data-full-name="${this.escapeHtml(place.full_name)}">
                <i class="fas fa-map-marker-alt"></i>
                ${this.escapeHtml(place.display_name)}
            </li>
        `).join('');

        // Add click handlers
        list.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                const input = document.getElementById(`${fieldType}_place`);
                const fullName = li.getAttribute('data-full-name');
                input.value = fullName;
                this.hideSuggestions(fieldType);
                input.focus();
                console.log(`Selected ${fieldType} location:`, fullName);
            });

            li.addEventListener('mouseenter', () => {
                list.querySelectorAll('li').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
            });
        });

        list.style.display = 'block';
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    showLoading(fieldType) {
        const list = document.getElementById(`${fieldType}_suggestions`);
        list.innerHTML = '<li><div class="loading"></div> Searching...</li>';
        list.style.display = 'block';
    }

    hideSuggestions(fieldType) {
        const list = document.getElementById(`${fieldType}_suggestions`);
        list.innerHTML = '';
        list.style.display = 'none';
    }

    hideAllSuggestions() {
        this.hideSuggestions('start');
        this.hideSuggestions('end');
    }

    showAlert(message, type = 'error') {
        const container = document.getElementById('alertContainer');
        container.innerHTML = `
            <div class="alert ${type}">
                <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : 'check-circle'}"></i>
                ${message}
            </div>
        `;
        
        if (type === 'error') {
            setTimeout(() => {
                if (container.innerHTML.includes(message)) {
                    container.innerHTML = '';
                }
            }, 5000);
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        console.log("Form submitted");
        
        const formData = new FormData(e.target);
        
        if (!this.validateForm(formData)) {
            return;
        }

        await this.calculateAlarmTime(formData);
    }

    validateForm(formData) {
        const startPlace = formData.get('start_place').trim();
        const endPlace = formData.get('end_place').trim();
        const arrivalTime = formData.get('arrival_time');
        const gettingReady = formData.get('getting_ready');
        
        if (!startPlace || !endPlace || !arrivalTime || !gettingReady) {
            this.showAlert('Please fill in all required fields.');
            return false;
        }
        
        if (startPlace === endPlace) {
            this.showAlert('Start location and destination cannot be the same.');
            return false;
        }

        return true;
    }

    async calculateAlarmTime(formData) {
        const submitBtn = document.getElementById('submitBtn');
        const resultDiv = document.getElementById('result');
        
        // Update UI for loading state
        submitBtn.innerHTML = '<div class="loading"></div> Calculating...';
        submitBtn.disabled = true;
        resultDiv.style.display = 'none';
        this.hideAllSuggestions();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            console.log("Sending calculation request...");
            const response = await fetch('/calculate', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Calculation response:", data);
            
            if (data.error) {
                this.showAlert(data.error);
            } else {
                this.lastCalculation = data;
                this.refreshDerivedResults();
                this.showAlert('Alarm time calculated successfully!', 'success');
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                this.showAlert('Request timed out. Please check your internet connection and try again.');
            } else {
                this.showAlert('An error occurred while calculating. Please try again.');
            }
            console.error('Calculation error:', error);
        } finally {
            submitBtn.innerHTML = '<i class="fas fa-calculator"></i><span>Calculate Alarm Time</span>';
            submitBtn.disabled = false;
        }
    }

    displayResults(data) {
        this.lastCalculation = data;
        this.refreshDerivedResults();
    }

    scheduleAlarm(alarmTime) {
        const [hour, minute] = alarmTime.split(':').map(Number);
        const now = new Date();
        const alarmDate = new Date();
        
        alarmDate.setHours(hour, minute, 0, 0);
        
        // If alarm time has passed for today, schedule for tomorrow
        if (alarmDate <= now) {
            alarmDate.setDate(alarmDate.getDate() + 1);
        }
        
        const timeUntilAlarm = alarmDate.getTime() - now.getTime();
        
        if (timeUntilAlarm > 0 && timeUntilAlarm < 24 * 60 * 60 * 1000) {
            setTimeout(() => {
                this.triggerAlarm();
            }, timeUntilAlarm);
            
            console.log(`Alarm scheduled for ${alarmDate}`);
        }
    }

    triggerAlarm() {
        try {
            document.getElementById('alarmAudio').play();
            if (Notification.permission === 'granted') {
                new Notification('⏰ Smart Alarm', {
                    body: 'Time to wake up!',
                    icon: '/favicon.ico'
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification('⏰ Smart Alarm', {
                            body: 'Time to wake up!',
                            icon: '/favicon.ico'
                        });
                    }
                });
            }
        } catch (error) {
            console.error('Error triggering alarm:', error);
            alert('⏰ Wake up! Time to get ready!');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SmartAlarm();
});

// Request notification permission on load
if ('Notification' in window) {
    Notification.requestPermission();
}