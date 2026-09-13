-- All confirmed-sale writers (including imports) participate in the same protocol.
-- Fail fast instead of waiting: a trigger can run after a caller has locked stock,
-- balances or another customer's row. Waiting here would introduce lock inversions.
-- SQLSTATE 40001 asks the caller to retry the entire transaction.
CREATE OR REPLACE FUNCTION ampmais_lock_confirmed_purchase_history()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  chave text;
BEGIN
  IF NEW.status_venda = 'CONFIRMADA' AND NEW.cliente_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR OLD.status_venda IS DISTINCT FROM NEW.status_venda
      OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id
      OR OLD.organizacao_id IS DISTINCT FROM NEW.organizacao_id THEN
      chave := NEW.organizacao_id || ':' || NEW.cliente_id || ':primeira-compra';
      IF NOT pg_try_advisory_xact_lock(hashtextextended(chave, 0)) THEN
        RAISE EXCEPTION 'Outra compra deste cliente está sendo processada. Tente novamente.' USING ERRCODE = '40001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ampmais_sales_purchase_history_lock
BEFORE INSERT OR UPDATE OF status_venda, cliente_id, organizacao_id ON ampmais_sales
FOR EACH ROW EXECUTE FUNCTION ampmais_lock_confirmed_purchase_history();
