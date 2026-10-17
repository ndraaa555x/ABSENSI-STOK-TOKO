-- Seed quantities and prices were estimates, not verified physical inventory.
-- Keep rows, costs, and movement history for auditability, but block sale/order selection
-- until the owner verifies each SKU against physical stock and invoices.
update public.products
set is_active = false,
    description = case
      when coalesce(description,'') ilike '%BELUM DIVERIFIKASI%' then description
      else concat_ws(' ', nullif(description,''), '[BELUM DIVERIFIKASI] Stok dan harga seed adalah estimasi. Cocokkan barang fisik dan faktur sebelum mengaktifkan untuk penjualan.')
    end
where sku ~ '^(CPU|MB|RAM|SSD|PER|NET|PSU|COOL|MON|CASE|VGA|UPS|CAB|CON|IPH)-';