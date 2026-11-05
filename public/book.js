/*
 * Cabadra "Book now" for a hotel's own website. One line:
 *
 *   <script src="https://hotel.churmuri.com/book.js" data-hotel="your-hotel" async></script>
 *
 * Adds a Book now button that opens the booking page in a popup. Options on the script tag:
 *   data-label="Book a room"   the button's words
 *   data-color="#111111"       button colour (hex)
 *   data-text-color="#ffffff"  button text colour (hex)
 *   data-position="left"       corner for the button (default right)
 *   data-button="none"         no floating button; open it from your own button instead:
 *                              <a href="#" data-cabadra-book>Book now</a>
 * From your own code: CabadraBooking.open() and CabadraBooking.close().
 */
(function () {
  var script = document.currentScript;
  if (!script || window.CabadraBooking) return;
  var slug = script.getAttribute('data-hotel');
  if (!slug) return;
  var origin = new URL(script.src, location.href).origin;
  var hex = /^#[0-9a-fA-F]{3,8}$/;
  var color = hex.test(script.getAttribute('data-color') || '') ? script.getAttribute('data-color') : '#111111';
  var textColor = hex.test(script.getAttribute('data-text-color') || '') ? script.getAttribute('data-text-color') : '#ffffff';
  var label = script.getAttribute('data-label') || 'Book now';
  var side = script.getAttribute('data-position') === 'left' ? 'left' : 'right';
  var floating = script.getAttribute('data-button') !== 'none';
  var overlay = null;
  var opener = null;
  var prevOverflow = '';

  function onKey(e) { if (e.key === 'Escape') close(); }
  function onMessage(e) {
    if (e.origin !== origin || !overlay || e.source !== overlay.querySelector('iframe').contentWindow) return;
    if (e.data && e.data.type === 'cabadra-booking-close') close();
  }

  function open() {
    if (overlay) return;
    opener = document.activeElement;
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Book your stay');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:0';
    var box = document.createElement('div');
    var small = window.innerWidth < 520;
    box.style.cssText = 'background:#eef0ec;overflow:hidden;width:' + (small ? '100%' : '480px') + ';height:' + (small ? '100%' : 'min(760px,calc(100% - 32px))') + ';border-radius:' + (small ? '0' : '24px') + ';box-shadow:0 25px 50px -12px rgba(0,0,0,.35)';
    var frame = document.createElement('iframe');
    frame.src = origin + '/book/' + encodeURIComponent(slug) + '?embed=1';
    frame.title = 'Book your stay';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#eef0ec';
    box.appendChild(frame);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    frame.focus();
  }

  function close() {
    if (!overlay) return;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('message', onMessage);
    overlay.remove();
    overlay = null;
    document.documentElement.style.overflow = prevOverflow;
    if (opener && opener.focus) opener.focus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-cabadra-book]') : null;
    if (t) { e.preventDefault(); open(); }
  });

  function addButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('data-cabadra-book', '');
    b.style.cssText = 'position:fixed;bottom:20px;' + side + ':20px;z-index:2147482000;height:48px;padding:0 24px;border:0;border-radius:999px;cursor:pointer;font:500 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:' + color + ';color:' + textColor + ';box-shadow:0 6px 20px rgba(0,0,0,.22)';
    document.body.appendChild(b);
  }

  window.CabadraBooking = { open: open, close: close };
  if (floating) {
    if (document.body) addButton();
    else document.addEventListener('DOMContentLoaded', addButton);
  }
})();
