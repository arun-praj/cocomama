CREATE OR REPLACE FUNCTION refresh_user_transaction_balances(target_user_id uuid)
RETURNS void AS $$
BEGIN
	IF target_user_id IS NULL THEN
		RETURN;
	END IF;

	UPDATE users
	SET
		spendable_balance = COALESCE((
			SELECT SUM(
				CASE
					WHEN t.type = 'income' THEN t.amount
					WHEN t.type = 'expense' AND t.funded_by_budget_id IS NULL THEN -t.amount
					WHEN t.type = 'savings' THEN -t.amount
					ELSE 0
				END
			)
			FROM transactions t
			WHERE t.user_id = target_user_id
				AND t.deleted_at IS NULL
		), 0),
		total_saved = COALESCE((
			SELECT SUM(t.amount)
			FROM transactions t
			WHERE t.user_id = target_user_id
				AND t.deleted_at IS NULL
				AND t.type = 'savings'
		), 0),
		updated_at = now()
	WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apply_transaction_to_balance()
RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM refresh_user_transaction_balances(OLD.user_id);
		RETURN OLD;
	END IF;

	PERFORM refresh_user_transaction_balances(NEW.user_id);

	IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
		PERFORM refresh_user_transaction_balances(OLD.user_id);
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_apply_transaction_to_balance ON transactions;
--> statement-breakpoint
CREATE TRIGGER trg_apply_transaction_to_balance
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION apply_transaction_to_balance();
--> statement-breakpoint
UPDATE users
SET
	spendable_balance = COALESCE((
		SELECT SUM(
			CASE
				WHEN t.type = 'income' THEN t.amount
				WHEN t.type = 'expense' AND t.funded_by_budget_id IS NULL THEN -t.amount
				WHEN t.type = 'savings' THEN -t.amount
				ELSE 0
			END
		)
		FROM transactions t
		WHERE t.user_id = users.id
			AND t.deleted_at IS NULL
	), 0),
	total_saved = COALESCE((
		SELECT SUM(t.amount)
		FROM transactions t
		WHERE t.user_id = users.id
			AND t.deleted_at IS NULL
			AND t.type = 'savings'
	), 0),
	updated_at = now();