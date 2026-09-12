-- Duas grafias da mesma caixa postal criavam duas contas: o email era gravado exatamente como
-- digitado (" alexandre.a.c.l17@gmail.com" com espaco, "Contato.auraenergia@gmail.com" com caixa
-- alta) e a busca por email usava igualdade crua, entao o login com Google nao achava a conta
-- existente e criava outra — sem as organizacoes em que a pessoa ja era membro.

UPDATE "ampmais_users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));

-- Trava: o indice unico abaixo falha se ainda houver duplicatas. Resolva-as antes de aplicar.
DO $$
DECLARE duplicados text;
BEGIN
	SELECT string_agg(email, ', ') INTO duplicados
	FROM (SELECT email FROM "ampmais_users" GROUP BY email HAVING count(*) > 1) d;

	IF duplicados IS NOT NULL THEN
		RAISE EXCEPTION 'Ha contas duplicadas por email e elas precisam ser unificadas antes: %', duplicados;
	END IF;
END $$;

CREATE UNIQUE INDEX "uq_users_email" ON "ampmais_users" (lower(btrim("email")));
