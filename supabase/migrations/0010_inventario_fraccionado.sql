-- Modificamos los tipos de cantidad y stock a numeric(12, 2)
alter table productos 
  alter column stock_actual type numeric(12, 2),
  alter column stock_minimo type numeric(12, 2);

alter table movimientos_inventario 
  alter column cantidad type numeric(12, 2);

-- cobro_lineas también, aunque no se cobre a los clientes la dosis, 
-- por uniformidad de la db y si alguna vez quieren cobrar fracciones
alter table cobro_lineas
  alter column cantidad type numeric(12, 2);

-- Agregamos los nuevos campos a productos
alter table productos 
  add column presentacion text not null default '',
  add column composicion text not null default '',
  add column unidad_medida text not null default 'unidad',
  add column contenido_presentacion numeric(12, 2) not null default 1;
