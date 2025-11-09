// Frontend prototype client logic (no framework) for BiyaHero starter
// Added: simple section routing, link-card click handlers, and smoother transitions

(function(){
  const socket = io();

  // Basic elements
  const pickupSelect = document.getElementById('pickupSelect');
  const dropoffSelect = document.getElementById('dropoffSelect');
  const passengerType = document.getElementById('passengerType');
  const passengerCount = document.getElementById('passengerCount');
  const estimatedFareEl = document.getElementById('estimatedFare');
  const btnRequestRide = document.getElementById('btnRequestRide');
  const btnCancelBooking = document.getElementById('btnCancelBooking');
  const passengerDash = document.getElementById('passengerDash');
  const driverDash = document.getElementById('driverDash');
  const welcome = document.getElementById('welcome');
  const toastContainer = document.getElementById('toastContainer');
  const offersList = document.getElementById('offersList');

  // Section mapping for client router
  const sections = Array.from(document.querySelectorAll('main .panel, main #welcome, main #rideHistory, main #help')).reduce((acc, el) => {
    if (el.id) acc[el.id] = el;
    return acc;
  }, {});

  function showSection(id) {
    Object.keys(sections).forEach(k => {
      const el = sections[k];
      if (k === id) {
        el.classList.remove('hidden');
        el.classList.add('section-enter','section-enter-active');
        // remove enter classes after animation so subsequent nav works
        setTimeout(()=> el.classList.remove('section-enter','section-enter-active'), 260);
        // slightly scroll into view for small screens
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        el.classList.add('hidden');
      }
    });
  }

  // wire navigation links and link-cards
  document.querySelectorAll('.nav-link, .link-card, .plain-link, .brand-link').forEach(node => {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      const target = node.dataset.target;
      if (target && sections[target]) {
        showSection(target);
      } else if (target === 'passengerDash') {
        showSection('passengerDash');
      } else if (target === 'driverDash') {
        showSection('driverDash');
      } else {
        // fallback: show welcome
        showSection('welcome');
      }
    });
  });

  // existing code continues (fetch locations, fare compute, socket flows)
  let locations = {};
  let currentRide = null;
  let passengerId = null;
  let driverState = { id:null, online:false, info:null };
  const shownToasts = new Set();

  // Toast system with simple throttling (prevent duplicates quickly)
  function showToast(message, type='info', id=null) {
    const key = id || `${type}|${message}`;
    if (shownToasts.has(key)) return;
    shownToasts.add(key);
    setTimeout(()=> shownToasts.delete(key), 4500);
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = message;
    toastContainer.appendChild(t);
    setTimeout(()=> t.remove(), 4200);
  }

  // bootstrap
  fetch('/api/locations').then(r=>r.json()).then(data => {
    locations = data;
    populateLocationSelects();
    for(let i=1;i<=6;i++){ 
      const o = document.createElement('option'); o.value = i; o.innerText = i; passengerCount.appendChild(o);
    }
    computeFarePreview();
  });

  function populateLocationSelects(){
    const keys = Object.keys(locations);
    keys.forEach(k=>{
      const opt1 = document.createElement('option'); opt1.value = k; opt1.innerText = locations[k].label;
      const opt2 = opt1.cloneNode(true);
      pickupSelect.appendChild(opt1);
      dropoffSelect.appendChild(opt2);
    });
    pickupSelect.value = 'SBNCHS';
    dropoffSelect.value = 'SBCES';
  }

  function computeFarePreview(){
    const payload = {
      pickup: pickupSelect.value,
      dropoff: dropoffSelect.value,
      passengerType: passengerType.value,
      passengerCount: Number(passengerCount.value || 1)
    };
    fetch('/api/fare', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)})
      .then(r=>r.json()).then(res=>{
        estimatedFareEl.innerText = `₱${res.total.toFixed(2)} • ${res.distanceMeters} m`;
      });
  }

  [pickupSelect, dropoffSelect, passengerType, passengerCount].forEach(el => el && el.addEventListener('change', computeFarePreview));

  // Passenger actions
  document.getElementById('btnPassengerStart').addEventListener('click', ()=> {
    showSection('passengerDash');
    if(!passengerId) passengerId = 'P' + Date.now();
  });

  btnRequestRide.addEventListener('click', ()=> {
    const payload = {
      passengerId,
      name: 'Passenger',
      pickup: pickupSelect.value,
      dropoff: dropoffSelect.value,
      passengerType: passengerType.value,
      passengerCount: Number(passengerCount.value || 1)
    };
    socket.emit('ride_request', payload);
    showToast('Ride request submitted. Broadcasting to nearby drivers...', 'info', 'request_sent');
    btnCancelBooking.classList.remove('hidden');
    btnRequestRide.disabled = true;
  });

  btnCancelBooking.addEventListener('click', ()=> {
    currentRide = null;
    btnCancelBooking.classList.add('hidden');
    btnRequestRide.disabled = false;
    showToast('Booking cancelled.', 'warn', 'cancelled');
  });

  // Driver actions
  document.getElementById('btnDriverStart').addEventListener('click', ()=> {
    showSection('driverDash');
  });

  document.getElementById('btnDriverRegister').addEventListener('click', ()=> {
    const name = document.getElementById('driverNameInput').value || 'Driver';
    const plate = document.getElementById('plateNumber').value || 'PLATE';
    const color = document.getElementById('tricycleColor').value || 'Purple';
    const contact = document.getElementById('contactNumber').value || '09';
    const vehicleNumber = Number(document.getElementById('vehicleNumber').value || 1);

    fetch('/api/login/driver', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ name, plateNumber: plate, color, contact, vehicleNumber })
    }).then(r=>r.json()).then(res=>{
      driverState.id = res.id;
      driverState.info = res;
      driverState.online = true;
      socket.emit('driver_register', { driverId: driverState.id, online: true });
      showToast('Registered and went online.', 'success', 'driver_online');
      document.getElementById('btnDriverToggle').innerText = 'Go Offline';
    });
  });

  document.getElementById('btnDriverToggle').addEventListener('click', ()=> {
    if(!driverState.id) {
      showToast('Please register first.', 'error');
      return;
    }
    driverState.online = !driverState.online;
    socket.emit('driver_toggle_online', { driverId: driverState.id, online: driverState.online });
    document.getElementById('btnDriverToggle').innerText = driverState.online ? 'Go Offline' : 'Go Online';
    showToast(driverState.online ? 'You are now online.' : 'You are now offline.', 'info');
  });

  // Socket listeners (driver receives ride offers)
  socket.on('ride_offer', (offer) => {
    if(!driverState.id || !driverState.online) return;
    const el = document.createElement('div');
    el.className = 'offer';
    el.innerHTML = `
      <div>
        <div><strong>${offer.passengerName}</strong> • ${offer.passengerCount} pax • ₱${offer.fare}</div>
        <div class="meta">${offer.pickup} → ${offer.dropoff} • ${offer.distanceMeters}m</div>
      </div>
      <div class="controls">
        <button class="btn small accept">Accept</button>
        <button class="btn small ghost reject">Reject</button>
      </div>
    `;
    offersList.prepend(el);
    while(offersList.children.length > 7) offersList.removeChild(offersList.lastChild);

    el.querySelector('.accept').addEventListener('click', ()=> {
      if(!driverState.id) return;
      socket.emit('ride_accept', { driverId: driverState.id, rideId: offer.rideId });
      showToast('You accepted the ride. Proceed to pickup.', 'success');
    });
    el.querySelector('.reject').addEventListener('click', ()=> {
      socket.emit('ride_reject', { driverId: driverState.id, rideId: offer.rideId });
      el.remove();
      showToast('Offer rejected.', 'info');
    });
  });

  socket.on('ride_accepted', ({ rideId, driverInfo, fare }) => {
    showToast(`Driver ${driverInfo.name} accepted your ride. Fare ₱${fare}`, 'success', `accepted_${rideId}`);
    currentRide = { rideId, driverInfo, fare };
    document.getElementById('driverInfo').classList.remove('hidden');
    document.getElementById('driverName').innerText = `Driver: ${driverInfo.name}`;
    document.getElementById('driverPlate').innerText = `Plate: ${driverInfo.plateNumber || '—'}`;
    document.getElementById('eta').innerText = `ETA: ~4 min`;
  });

  socket.on('ride_update', ({ rideId, status }) => {
    showToast(`Ride ${rideId} status: ${status}`, 'info', `status_${rideId}_${status}`);
  });

  socket.on('ride_completed', ({ rideId, summary }) => {
    showToast('Ride completed. Please rate your driver.', 'success', `completed_${rideId}`);
    setTimeout(()=> {
      const rating = prompt('Rate your ride (1–5):');
      const comment = prompt('Any short feedback?');
      if (rating) showToast('Thank you for your feedback.', 'success');
    }, 500);
  });

  // initial section
  showSection('welcome');

  // expose for debugging accidentally
  window._biyahero = { showSection };
})();
