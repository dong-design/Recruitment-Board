// Compact, dependency-free date popover. Input values remain ISO dates for FormData.
(() => {
  let input = null, popup = null, cursor = null;
  const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function close(focus = false) {
    if (!popup) return false;
    popup.remove(); popup = null;
    if (input) { input.setAttribute('aria-expanded', 'false'); if (focus && input.isConnected) input.focus(); }
    input = null; return true;
  }
  window.closeDatePicker = close;
  function select(value) {
    const target = input; target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }
  function position() {
    const rect = input.getBoundingClientRect(), width = Math.min(324, innerWidth - 24);
    popup.style.width = width + 'px';
    popup.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + 'px';
    const height = popup.offsetHeight;
    popup.style.top = Math.max(12, Math.min(rect.bottom + 8, innerHeight - height - 12)) + 'px';
  }
  function render() {
    const year = cursor.getFullYear(), month = cursor.getMonth(), start = new Date(year, month, 1), today = iso(new Date());
    start.setDate(1 - ((start.getDay()+6)%7));
    let cells = '';
    for (let i=0;i<42;i++) {
      const date = new Date(start); date.setDate(start.getDate()+i); const value = iso(date);
      const disabled = (input.min && value < input.min) || (input.max && value > input.max);
      cells += `<button type="button" role="gridcell" data-date="${value}" aria-label="${value}" aria-selected="${value===input.value}" ${disabled ? 'disabled' : ''} class="cal-day ${date.getMonth()!==month?'outside':''} ${value===today?'today':''} ${value===input.value?'selected':''}">${date.getDate()}</button>`;
    }
    popup.innerHTML = `<div class="cal-title"><span>选择日期</span><button type="button" data-cal="close" aria-label="关闭日期选择">×</button></div><div class="cal-nav"><button type="button" data-cal="prev" aria-label="上个月">‹</button><div><select aria-label="年份" data-cal="year">${Array.from({length:31},(_,i)=>year-15+i).map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select><select aria-label="月份" data-cal="month">${Array.from({length:12},(_,i)=>`<option value="${i}" ${i===month?'selected':''}>${i+1}月</option>`).join('')}</select></div><button type="button" data-cal="next" aria-label="下个月">›</button></div><div class="cal-week">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div><div class="cal-grid" role="grid" aria-label="${year}年${month+1}月">${cells}</div><div class="cal-footer"><button type="button" data-cal="clear">清空</button><button type="button" data-cal="today">今天</button></div>`;
    position();
  }
  function open(target) {
    close(); input = target;
    const initial = target.value ? new Date(target.value+'T12:00:00') : new Date();
    cursor = new Date(initial.getFullYear(), initial.getMonth(), 1);
    popup = document.createElement('div'); popup.className = 'date-popover'; popup.setAttribute('role','dialog'); popup.setAttribute('aria-label','选择日期');
    document.body.append(popup); input.setAttribute('aria-expanded','true');
    popup.addEventListener('click', event => {
      event.stopPropagation(); // Month navigation replaces its button; do not treat it as an outside click.
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.date) return select(button.dataset.date);
      if (button.dataset.cal === 'close') return close(true);
      if (button.dataset.cal === 'clear') return select('');
      if (button.dataset.cal === 'today') {
        const value = iso(new Date());
        if ((!input.min || value >= input.min) && (!input.max || value <= input.max)) select(value);
        return;
      }
      cursor.setMonth(cursor.getMonth() + (button.dataset.cal === 'prev' ? -1 : 1)); render();
    });
    popup.addEventListener('change', event => {
      if (event.target.dataset.cal === 'year') cursor.setFullYear(Number(event.target.value));
      if (event.target.dataset.cal === 'month') cursor.setMonth(Number(event.target.value));
      render();
    });
    render(); (popup.querySelector('.selected') || popup.querySelector('.today') || popup.querySelector('.cal-day:not(.outside)')).focus();
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('input[type="date"]');
    if (target && !target.disabled) { event.preventDefault(); open(target); }
    else if (popup && !popup.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.target.matches('input[type="date"]') && ['Enter',' ','ArrowDown'].includes(event.key)) { event.preventDefault(); open(event.target); }
    if (!popup || !event.target.matches('.cal-day')) return;
    const offset = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7 }[event.key];
    if (offset) {
      event.preventDefault(); const date = new Date(event.target.dataset.date+'T12:00:00'); date.setDate(date.getDate()+offset);
      if (date.getMonth() !== cursor.getMonth() || date.getFullYear() !== cursor.getFullYear()) { cursor = new Date(date.getFullYear(),date.getMonth(),1); render(); }
      popup.querySelector(`[data-date="${iso(date)}"]`)?.focus();
    }
  });
  window.addEventListener('resize', () => { if(popup) position(); });
  document.addEventListener('scroll', () => { if(popup && input?.isConnected) position(); }, true);
})();
