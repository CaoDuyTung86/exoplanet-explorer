"""Tests for the rules around passwords, tokens and user-supplied names.

These are the parts where a mistake is a security bug rather than a wrong pixel, so they
are pinned down here. Nothing in this file touches Postgres.
"""

from __future__ import annotations

import pytest

from app import security


class TestPasswordHashing:
    def test_verifies_the_right_password(self):
        stored = security.hash_password("correct horse battery")
        assert security.verify_password(stored, "correct horse battery")

    def test_rejects_the_wrong_password(self):
        stored = security.hash_password("correct horse battery")
        assert not security.verify_password(stored, "correct horse batteries")

    def test_hash_is_salted(self):
        # Same password, two registrations: the stored values must differ, otherwise the
        # table tells an attacker which accounts share a password.
        assert security.hash_password("same-password") != security.hash_password("same-password")

    def test_the_password_is_not_recoverable_from_the_hash(self):
        stored = security.hash_password("hunter2000")
        assert "hunter2000" not in stored

    def test_a_corrupt_hash_is_a_failed_login_not_a_crash(self):
        assert not security.verify_password("not-an-argon2-hash", "anything")

    def test_current_parameters_do_not_need_a_rehash(self):
        assert not security.needs_rehash(security.hash_password("whatever-goes-here"))

    def test_an_unreadable_hash_is_flagged_for_rehash(self):
        assert security.needs_rehash("$2b$12$legacy-bcrypt-style-value")


class TestSessionTokens:
    def test_tokens_are_unique(self):
        assert len({security.new_session_token() for _ in range(200)}) == 200

    def test_token_has_enough_entropy_to_be_unguessable(self):
        # token_urlsafe(32) is 32 random bytes in base64url, so ~43 characters.
        assert len(security.new_session_token()) >= 40

    def test_hash_is_stable_and_not_the_token(self):
        token = security.new_session_token()
        digest = security.hash_token(token)
        assert digest == security.hash_token(token)
        assert token not in digest
        assert len(digest) == 64  # sha256, hex

    def test_different_tokens_hash_differently(self):
        assert security.hash_token("a") != security.hash_token("b")


class TestEmailNormalisation:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("Someone@Example.COM", "someone@example.com"),
            ("  spaced@example.com  ", "spaced@example.com"),
            ("dotted.name@sub.example.co.uk", "dotted.name@sub.example.co.uk"),
        ],
    )
    def test_normalises(self, raw, expected):
        assert security.normalise_email(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        ["", "   ", "no-at-sign", "@example.com", "user@", "user@localhost", "a b@example.com"],
    )
    def test_rejects_malformed(self, raw):
        with pytest.raises(security.ValidationError):
            security.normalise_email(raw)

    def test_rejects_absurd_length(self):
        with pytest.raises(security.ValidationError):
            security.normalise_email("x" * 250 + "@example.com")


class TestPasswordStrength:
    def test_accepts_a_reasonable_password(self):
        security.check_password_strength("x" * security.MIN_PASSWORD_LENGTH)

    def test_rejects_short(self):
        with pytest.raises(security.ValidationError):
            security.check_password_strength("x" * (security.MIN_PASSWORD_LENGTH - 1))

    def test_rejects_absurdly_long(self):
        # Argon2 is memory-hard by design; an unbounded input turns a login into a DoS.
        with pytest.raises(security.ValidationError):
            security.check_password_strength("x" * (security.MAX_PASSWORD_LENGTH + 1))


class TestDisplayName:
    def test_keeps_a_normal_name(self):
        assert security.clean_display_name("Duy Tùng", fallback="anon") == "Duy Tùng"

    def test_falls_back_when_blank(self):
        assert security.clean_display_name("   ", fallback="anon") == "anon"

    def test_strips_control_characters(self):
        # This name is rendered in the presence bar next to other people, so a
        # visitor does not get to smuggle control bytes into it.
        hostile = "Ada" + chr(0) + "Love" + chr(13) + "lace" + chr(10)
        assert security.clean_display_name(hostile, fallback="anon") == "AdaLovelace"

    def test_clamps_length(self):
        cleaned = security.clean_display_name("N" * 500, fallback="anon")
        assert len(cleaned) == security.MAX_DISPLAY_NAME_LENGTH
