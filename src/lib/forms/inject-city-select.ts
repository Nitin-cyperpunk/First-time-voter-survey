type SelectableCity = {
  id: string;
  name: string;
  state: string;
};

const CITY_SELECT_HTML = `<select name="city_id" id="city_id" required>
  <option value="">Select city</option>
</select>`;

export function ensureCityIdSelect(html: string): string {
  if (/name=["']city_id["']/i.test(html)) return html;

  if (/<input[^>]*name=["']city["'][^>]*>/i.test(html)) {
    return html.replace(/<input[^>]*name=["']city["'][^>]*>/i, CITY_SELECT_HTML);
  }

  const areaBlock = html.match(
    /<div class="q"[^>]*data-key="area"[\s\S]*?<\/div>\s*/i,
  );
  if (areaBlock) {
    const insert = `${areaBlock[0]}<div class="q" data-key="city_id"><label class="q-label">City</label>${CITY_SELECT_HTML}<div class="err-msg">Please select a city.</div></div>\n`;
    return html.replace(areaBlock[0], insert);
  }

  return html;
}

export function injectSelectableCitiesScript(
  html: string,
  cities: SelectableCity[],
): string {
  if (!/<\/head>/i.test(html)) return html;

  const payload = JSON.stringify(cities).replace(/</g, "\\u003c");
  const script = `<script>
window.__concaveSelectableCities=${payload};
(function(){
  function fillCitySelect(){
    var cities = window.__concaveSelectableCities || [];
    var sel = document.querySelector('select[name="city_id"]');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">Select city</option>';
    cities.forEach(function(c){
      var o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name + (c.state ? ' (' + c.state + ')' : '');
      sel.appendChild(o);
    });
    if (current && cities.some(function(c){ return c.id === current; })) sel.value = current;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillCitySelect);
  } else {
    fillCitySelect();
  }
})();
</script>`;

  if (html.includes("window.__concaveSelectableCities=")) {
    return html.replace(
      /<script>\s*window\.__concaveSelectableCities=[\s\S]*?<\/script>/,
      script,
    );
  }

  return html.replace(/<\/head>/i, `  ${script}\n</head>`);
}
