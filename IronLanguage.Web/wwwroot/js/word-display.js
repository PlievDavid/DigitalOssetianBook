// A single display convention. Source texts and book typography stay intact.
window.AdamWordText = value => String(value || '').normalize('NFD').replace(/[\u0301\u0341]/g, '').replace(/æ/g,'ӕ').replace(/Æ/g,'Ӕ').normalize('NFC').toLocaleLowerCase('ru-RU');
