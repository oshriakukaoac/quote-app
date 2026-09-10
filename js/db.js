/* ===== שכבת נתונים – Supabase (Postgres) =====
   מחליפה את הגרסה הקודמת שהתבססה על localStorage (ראו supabase/schema.sql לסכמה).
   כל הפונקציות כאן אסינכרוניות (מחזירות Promise) - בכל מקום שקורא ל-DB.* צריך await.
   הרשאות (Row Level Security) ב-Supabase דואגות שכל משתמש יראה וישנה רק את הנתונים שלו,
   ולכן אין כאן שום סינון לפי משתמש בצד הלקוח - זה מטופל אוטומטית בשרת. */
const DB = (function(){

  function genId(){
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let cachedUserId = null;
  async function uid(){
    if(cachedUserId) return cachedUserId;
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if(error) throw error;
    if(!user) throw new Error('אין משתמש מחובר');
    cachedUserId = user.id;
    return cachedUserId;
  }

  /* ---- מיפוי בין עמודות ה-DB (snake_case) לשדות ה-JS (camelCase) ---- */
  function rowToCustomer(r){
    return { id: r.id, name: r.name, taxId: r.tax_id||'', address: r.address||'', phone: r.phone||'', email: r.email||'', contact: r.contact||'', createdAt: r.created_at };
  }
  function customerToRow(c, userId){
    return { user_id: userId, name: c.name, tax_id: c.taxId||null, address: c.address||null, phone: c.phone||null, email: c.email||null, contact: c.contact||null };
  }

  function rowToProduct(r){
    return { id: r.id, sku: r.sku||'', name: r.name, category: r.category||'', supplier: r.supplier||'', supplierPrice: Number(r.supplier_price)||0, costPrice: Number(r.cost_price)||0, marginPercent: Number(r.margin_percent)||0, salePrice: Number(r.sale_price)||0, favorite: !!r.favorite, mkt: r.mkt || {}, createdAt: r.created_at };
  }
  function productToRow(p, userId){
    return { user_id: userId, sku: p.sku||null, name: p.name, category: p.category||null, supplier: p.supplier||null, supplier_price: p.supplierPrice||0, cost_price: p.costPrice||0, margin_percent: p.marginPercent||0, sale_price: p.salePrice||0, favorite: !!p.favorite, mkt: p.mkt||{} };
  }

  function rowToQuote(r){
    return { id: r.id, number: r.number, status: r.status, customerId: r.customer_id||'', date: r.date, items: r.items||[], discountType: r.discount_type, discountValue: Number(r.discount_value)||0, vatPercent: Number(r.vat_percent)||0, notes: r.notes||'', finbotLink: r.finbot_link||'', createdAt: r.created_at, updatedAt: r.updated_at };
  }
  function quoteToRow(q, userId){
    return { user_id: userId, number: q.number ?? null, status: q.status||'draft', customer_id: q.customerId||null, date: q.date, items: q.items||[], discount_type: q.discountType||'fixed', discount_value: q.discountValue||0, vat_percent: q.vatPercent||0, notes: q.notes||null, finbot_link: q.finbotLink||null };
  }

  function rowToSupplierItem(r){
    return { id: r.id, supplier: r.supplier, supplierSku: r.supplier_sku||'', mfrSku: r.mfr_sku||'', description: r.description||'', cost: Number(r.cost)||0, category: r.category||'', manufacturer: r.manufacturer||'', availability: r.availability||'', imageUrl: r.image_url||'', importedAt: r.imported_at };
  }
  function supplierItemToRow(it, userId, supplier){
    return { user_id: userId, supplier: supplier, supplier_sku: it.supplierSku||null, mfr_sku: it.mfrSku||null, description: it.description||null, cost: it.cost||0, category: it.category||null, manufacturer: it.manufacturer||null, availability: it.availability||null, image_url: it.imageUrl||null };
  }

  function rowToSettings(r){
    return {
      companyName: r.company_name, taxId: r.tax_id, address: r.address, phone: r.phone, email: r.email,
      website: r.website, tagline: r.tagline, logoText: r.logo_text, defaultVat: Number(r.default_vat),
      defaultMargin: Number(r.default_margin), nextQuoteNumber: r.next_quote_number, finbotApiKey: r.finbot_api_key || ''
    };
  }
  function settingsToRow(s){
    return {
      company_name: s.companyName, tax_id: s.taxId, address: s.address, phone: s.phone, email: s.email,
      website: s.website, tagline: s.tagline, logo_text: s.logoText, default_vat: s.defaultVat,
      default_margin: s.defaultMargin, next_quote_number: s.nextQuoteNumber, finbot_api_key: s.finbotApiKey
    };
  }

  function defaultSettings(){
    return {
      companyName: 'אקוקה מחשוב וגרפיקה',
      taxId: '052863172',
      address: 'רחוב גפן 11, חריש',
      phone: '0587500070',
      email: 'oshri08@gmail.com',
      website: 'www.oac.co.il',
      tagline: 'OAC – שירותי מחשוב וענן',
      logoText: 'OAC',
      defaultVat: 18,
      defaultMargin: 30,
      nextQuoteNumber: 80157,
      finbotApiKey: ''
    };
  }

  async function getSettings(){
    const userId = await uid();
    const { data, error } = await supabaseClient.from('settings').select('*').eq('user_id', userId).maybeSingle();
    if(error) throw error;
    return data ? rowToSettings(data) : defaultSettings();
  }
  async function saveSettings(s){
    const userId = await uid();
    const row = settingsToRow(s);
    const { error } = await supabaseClient.from('settings').upsert({ user_id: userId, ...row }, { onConflict: 'user_id' });
    if(error) throw error;
  }

  // ---- לקוחות ----
  const Customers = {
    async all(){
      const { data, error } = await supabaseClient.from('customers').select('*').order('created_at', { ascending: false });
      if(error) throw error;
      return data.map(rowToCustomer);
    },
    async get(id){
      if(!id) return null;
      const { data, error } = await supabaseClient.from('customers').select('*').eq('id', id).maybeSingle();
      if(error) throw error;
      return data ? rowToCustomer(data) : null;
    },
    async save(c){
      const userId = await uid();
      if(!c.id){
        const { data, error } = await supabaseClient.from('customers').insert(customerToRow(c, userId)).select().single();
        if(error) throw error;
        return rowToCustomer(data);
      }
      const { data, error } = await supabaseClient.from('customers').update(customerToRow(c, userId)).eq('id', c.id).select().single();
      if(error) throw error;
      return rowToCustomer(data);
    },
    async remove(id){
      const { error } = await supabaseClient.from('customers').delete().eq('id', id);
      if(error) throw error;
    }
  };

  // ---- מוצרים ושירותים ----
  const Products = {
    async all(){
      const { data, error } = await supabaseClient.from('products').select('*').order('created_at', { ascending: false });
      if(error) throw error;
      return data.map(rowToProduct);
    },
    async get(id){
      if(!id) return null;
      const { data, error } = await supabaseClient.from('products').select('*').eq('id', id).maybeSingle();
      if(error) throw error;
      return data ? rowToProduct(data) : null;
    },
    async save(p){
      const userId = await uid();
      if(!p.id){
        const { data, error } = await supabaseClient.from('products').insert(productToRow(p, userId)).select().single();
        if(error) throw error;
        return rowToProduct(data);
      }
      const { data, error } = await supabaseClient.from('products').update(productToRow(p, userId)).eq('id', p.id).select().single();
      if(error) throw error;
      return rowToProduct(data);
    },
    async remove(id){
      const { error } = await supabaseClient.from('products').delete().eq('id', id);
      if(error) throw error;
    }
  };

  // ---- הצעות מחיר ----
  const Quotes = {
    async all(){
      const { data, error } = await supabaseClient.from('quotes').select('*').order('updated_at', { ascending: false });
      if(error) throw error;
      return data.map(rowToQuote);
    },
    async get(id){
      if(!id) return null;
      const { data, error } = await supabaseClient.from('quotes').select('*').eq('id', id).maybeSingle();
      if(error) throw error;
      return data ? rowToQuote(data) : null;
    },
    async save(q){
      const userId = await uid();
      if(!q.id){
        if(!q.number){
          const s = await getSettings();
          q.number = s.nextQuoteNumber;
          s.nextQuoteNumber = s.nextQuoteNumber + 1;
          await saveSettings(s);
        }
        const { data, error } = await supabaseClient.from('quotes').insert(quoteToRow(q, userId)).select().single();
        if(error) throw error;
        return rowToQuote(data);
      }
      const row = quoteToRow(q, userId);
      row.updated_at = new Date().toISOString();
      const { data, error } = await supabaseClient.from('quotes').update(row).eq('id', q.id).select().single();
      if(error) throw error;
      return rowToQuote(data);
    },
    async remove(id){
      const { error } = await supabaseClient.from('quotes').delete().eq('id', id);
      if(error) throw error;
    },
    async duplicate(id){
      const src = await this.get(id);
      if(!src) return null;
      const copy = JSON.parse(JSON.stringify(src));
      delete copy.id;
      delete copy.number;
      copy.status = 'draft';
      copy.date = new Date().toISOString().slice(0,10);
      copy.items = (copy.items||[]).map(it => ({...it, id: genId()}));
      return this.save(copy);
    }
  };

  // ---- מאגר מחירי ספקים (ייבוא ממחירונים חיצוניים) ----
  const SupplierPrices = {
    async all(){
      const { data, error } = await supabaseClient.from('supplier_prices').select('*').order('imported_at', { ascending: false });
      if(error) throw error;
      return data.map(rowToSupplierItem);
    },
    async bySupplier(supplier){
      const { data, error } = await supabaseClient.from('supplier_prices').select('*').eq('supplier', supplier);
      if(error) throw error;
      return data.map(rowToSupplierItem);
    },
    async suppliers(){
      const { data, error } = await supabaseClient.from('supplier_prices').select('supplier');
      if(error) throw error;
      return [...new Set(data.map(r => r.supplier))];
    },
    /* מחליף את כל הרשומות של ספק נתון בקבוצת רשומות חדשה (ייבוא מלא מחדש) */
    async replaceForSupplier(supplier, items){
      const userId = await uid();
      const { error: delErr } = await supabaseClient.from('supplier_prices').delete().eq('supplier', supplier);
      if(delErr) throw delErr;
      const rows = items.map(it => supplierItemToRow(it, userId, supplier));
      const CHUNK = 500; // מכניסים בקבוצות כדי לא לחרוג ממגבלת גודל בקשה (למחירונים של אלפי שורות)
      for(let i = 0; i < rows.length; i += CHUNK){
        const { error } = await supabaseClient.from('supplier_prices').insert(rows.slice(i, i + CHUNK));
        if(error) throw error;
      }
      return rows.length;
    },
    /* חיפוש חופשי לפי מק"ט או תיאור, מוגבל למספר תוצאות */
    async search(query, limit){
      limit = limit || 20;
      query = (query || '').trim();
      if(!query) return [];
      const esc = query.replace(/[%_]/g, m => '\\' + m);
      const { data, error } = await supabaseClient.from('supplier_prices').select('*')
        .or(`supplier_sku.ilike.%${esc}%,mfr_sku.ilike.%${esc}%,description.ilike.%${esc}%`)
        .limit(limit);
      if(error) throw error;
      return data.map(rowToSupplierItem);
    },
    async clearSupplier(supplier){
      const { error } = await supabaseClient.from('supplier_prices').delete().eq('supplier', supplier);
      if(error) throw error;
    }
  };

  // ---- גיבוי / שחזור מלא ----
  async function exportAll(){
    const [customers, products, quotes, supplierPrices, settings] = await Promise.all([
      Customers.all(), Products.all(), Quotes.all(), SupplierPrices.all(), getSettings()
    ]);
    return { exportedAt: new Date().toISOString(), customers, products, quotes, supplierPrices, settings };
  }

  /* ייבוא גיבוי (מגרסת ה-localStorage הישנה, או מגיבוי קודם של הענן) לתוך Supabase.
     ה-id-ים הישנים לא תואמים ל-uuid שדורש Postgres, אז כל רשומה מקבלת id חדש,
     וממפים לקוח→הצעה ומוצר→פריט-בהצעה בהתאם כדי לשמר את הקישורים המקוריים. */
  async function importAll(data){
    if(!data || typeof data !== 'object') throw new Error('קובץ גיבוי לא תקין');

    const customerIdMap = {};
    if(Array.isArray(data.customers)){
      for(const c of data.customers){
        const oldId = c.id;
        const saved = await Customers.save({ ...c, id: null });
        if(oldId) customerIdMap[oldId] = saved.id;
      }
    }
    const productIdMap = {};
    if(Array.isArray(data.products)){
      for(const p of data.products){
        const oldId = p.id;
        const saved = await Products.save({ ...p, id: null });
        if(oldId) productIdMap[oldId] = saved.id;
      }
    }
    if(Array.isArray(data.quotes)){
      for(const q of data.quotes){
        const items = (q.items||[]).map(it => ({ ...it, id: genId(), productId: it.productId ? (productIdMap[it.productId] || null) : null }));
        await Quotes.save({ ...q, id: null, customerId: q.customerId ? (customerIdMap[q.customerId] || null) : null, items });
      }
    }
    if(Array.isArray(data.supplierPrices)){
      const bySupplier = {};
      data.supplierPrices.forEach(it => { (bySupplier[it.supplier] = bySupplier[it.supplier] || []).push(it); });
      for(const supplier of Object.keys(bySupplier)){
        await SupplierPrices.replaceForSupplier(supplier, bySupplier[supplier]);
      }
    }
    if(data.settings && typeof data.settings === 'object'){
      const current = await getSettings();
      await saveSettings({ ...current, ...data.settings });
    }
  }

  /* מוחק את כל הנתונים (לקוחות/מוצרים/הצעות/ספקים) של המשתמש הנוכחי. לא נוגע בהגדרות. */
  async function deleteAllData(){
    const userId = await uid();
    await Promise.all([
      supabaseClient.from('customers').delete().eq('user_id', userId),
      supabaseClient.from('products').delete().eq('user_id', userId),
      supabaseClient.from('quotes').delete().eq('user_id', userId),
      supabaseClient.from('supplier_prices').delete().eq('user_id', userId)
    ]);
  }

  return { genId, getSettings, saveSettings, defaultSettings, Customers, Products, Quotes, SupplierPrices, exportAll, importAll, deleteAllData };
})();
