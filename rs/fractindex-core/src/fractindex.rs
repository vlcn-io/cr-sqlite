extern crate alloc;

use core::intrinsics;

use alloc::{
    format,
    string::{String, ToString},
};

pub static BASE_62_DIGITS: &'static str =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

static SMALLEST_INTEGER: &'static str = "A00000000000000000000000000";
static INTEGER_ZERO: &'static str = "a0";

static a_charcode: usize = 97;
static z_charcode: usize = 122;
static A_charcode: usize = 65;
static Z_charcode: usize = 90;
static zero_charcode: usize = 48;

pub fn key_between(
    a: Option<&str>,
    b: Option<&str>,
    digits: Option<&str>,
) -> Result<Option<String>, &'static str> {
    let digits = digits.unwrap_or(BASE_62_DIGITS);
    if !a.is_none() {
        validate_order_key(a.unwrap())?;
    } else if !b.is_none() {
        validate_order_key(b.unwrap())?;
    }
    if !a.is_none() && !b.is_none() && a.unwrap() > b.unwrap() {
        return Err("key_between - a must be before b");
    }
    if a.is_none() {
        if b.is_none() {
            return Ok(Some(String::from(INTEGER_ZERO)));
        }

        let b = b.unwrap();
        let ib = get_integer_part(b)?;
        let fb = &b[ib.len()..];
        if ib == SMALLEST_INTEGER {
            return Ok(Some(format!("{}{}", ib, midpoint("", Some(fb), digits)?)));
        }
        if ib < b {
            return Ok(Some(String::from(ib)));
        }
        let res = decrement_integer(ib, digits)?;
        if res.is_none() {
            return Err("cannot decrement anymore");
        }
        return Ok(Some(res.unwrap()));
    }

    if b.is_none() {
        let a = a.unwrap();
        let ia = get_integer_part(a)?;
        let fa = &a[ia.len()..];
        let i = increment_integer(ia, digits)?;
        if i.is_none() {
            return Ok(Some(format!("{}{}", ia, midpoint(fa, None, digits)?)));
        } else {
            return Ok(i);
        }
    }

    let a = a.unwrap();
    let b = b.unwrap();
    let ia = get_integer_part(a)?;
    let ib = get_integer_part(b)?;
    let fa = &a[ia.len()..];
    let fb = &b[ib.len()..];
    if ia == ib {
        return Ok(Some(format!("{}{}", ia, midpoint(fa, Some(fb), digits)?)));
    }
    let i = increment_integer(ia, digits)?;
    if i.is_none() {
        return Err("Cannot increment anymore");
    }

    let i = i.unwrap();
    if i < b.to_string() {
        return Ok(Some(i));
    }

    Ok(Some(format!("{}{}", ia, midpoint(fa, None, digits)?)))
}

fn midpoint(a: &str, b: Option<&str>, digits: &str) -> Result<String, &'static str> {
    if b.is_some() && a > b.unwrap() {
        return Err("midpoint - a must be before b");
    }
    let a_bytes = a.as_bytes();
    let b_last_char = b.map(|b| {
        let b_bytes = b.as_bytes();
        b_bytes[b_bytes.len() - 1]
    });
    if a_bytes.len() > 0 && a_bytes[a_bytes.len() - 1] == zero_charcode as u8
        || (b_last_char.is_some() && b_last_char.unwrap() == zero_charcode as u8)
    {
        return Err("midpoint - a or b must not end with 0");
    }

    if b.is_some() {
        let b = b.unwrap();
        let mut n = 0;
        let b_bytes = b.as_bytes();

        while (if n < a_bytes.len() {
            a_bytes[n]
        } else {
            zero_charcode as u8
        } == b_bytes[n])
        {
            n += 1;
        }

        if n > 0 {
            return Ok(format!(
                "{}{}",
                &b[0..n],
                midpoint(&a[n..], Some(&b[n..]), digits)?
            ));
        }
    }

    let digit_a = if a.len() > 0 {
        digits.find(a_bytes[0] as char)
    } else {
        Some(0)
    };
    if digit_a.is_none() {
        return Err("midpoint - a has invalid digits");
    }
    let digit_a = digit_a.unwrap();

    let digit_b = if b.is_some() {
        digits.find(b.unwrap().as_bytes()[0] as char)
    } else {
        Some(digits.len())
    };
    if digit_b.is_none() {
        return Err("midpoint - b has invalid digits");
    }
    let digit_b = digit_b.unwrap();

    if digit_b - digit_a > 1 {
        let mid_digit = round(0.5 * (digit_a + digit_b) as f64);
        return Ok(String::from(&digits[mid_digit..mid_digit + 1]));
    } else {
        if b.is_some() && b.unwrap().len() > 1 {
            return Ok(String::from(&b.unwrap()[0..1]));
        } else {
            return Ok(format!(
                "{}{}",
                &digits[digit_a..digit_a + 1],
                midpoint(if a == "" { a } else { &a[1..] }, None, digits)?
            ));
        }
    }
}

fn round(d: f64) -> usize {
    unsafe { intrinsics::roundf64(d) as usize }
}

fn validate_order_key(key: &str) -> Result<(), &'static str> {
    if key == SMALLEST_INTEGER {
        return Err("Key is too small");
    }
    let i = get_integer_part(key)?;
    let f = &key[i.len()..];
    let as_bytes = f.as_bytes();
    if as_bytes.len() > 0 && as_bytes[as_bytes.len() - 1] == zero_charcode as u8 {
        return Err("Integer part should not end with 0");
    }

    Ok(())
}

fn get_integer_part(key: &str) -> Result<&str, &'static str> {
    // as_bytes is safe as we control the alphabet
    let integer_part_len = get_integer_len(key.as_bytes()[0])?;
    if integer_part_len > key.len() {
        return Err("integer part of key is too long");
    }
    return Ok(&key[0..integer_part_len]);
}

fn get_integer_len(head: u8) -> Result<usize, &'static str> {
    let head = head as usize;
    if head >= a_charcode && head <= z_charcode {
        return Ok(head - a_charcode + 2);
        // >= A and <= Z
    } else if head >= A_charcode && head <= Z_charcode {
        return Ok(Z_charcode - head + 2);
    } else {
        return Err("head is out of range");
    }
}

fn validate_integer(i: &str) -> Result<(), &'static str> {
    if i.len() != get_integer_len(i.as_bytes()[0])? {
        return Err("invalid integer part of order key");
    }

    return Ok(());
}

fn increment_integer(x: &str, digits: &str) -> Result<Option<String>, &'static str> {
    validate_integer(x)?;

    let head = &x[0..1];
    let mut digs = String::from(&x[1..]);
    let mut carry = true;

    let mut i = digs.len() as i32 - 1;
    while carry && i >= 0 {
        let ui = i as usize;
        let temp = digits.find(&digs[ui..ui + 1]);
        if temp.is_none() {
            return Err("invalid digit");
        }
        let d = temp.unwrap() + 1;

        if d == digits.len() {
            digs.replace_range(ui..ui + 1, "0");
        } else {
            digs.replace_range(ui..ui + 1, &digits[d..d + 1]);
            carry = false;
        }
        i -= 1;
    }

    if carry {
        if head == "Z" {
            return Ok(Some(String::from("a0")));
        }
        if head == "z" {
            return Ok(None);
        }
        let h = head.as_bytes()[0] + 1;
        if h > a_charcode as u8 {
            digs.push('0');
        } else {
            digs.pop();
        }
        return Ok(Some(format!("{}{}", h as char, digs)));
    } else {
        return Ok(Some(format!("{}{}", head, digs)));
    }
}

fn decrement_integer(x: &str, digits: &str) -> Result<Option<String>, &'static str> {
    validate_integer(x)?;

    let head = &x[0..1];
    let mut digs = String::from(&x[1..]);
    let mut borrow = true;

    let mut i = digs.len() as i32 - 1;
    while borrow && i >= 0 {
        let ui = i as usize;
        let temp = digits.find(&digs[ui..ui + 1]);
        if temp.is_none() {
            return Err("invalid digit");
        }
        let d = temp.unwrap() as i32 - 1;

        if d == -1 {
            digs.replace_range(ui..ui + 1, &digits[digits.len() - 1..digits.len()]);
        } else {
            let ud = d as usize;
            digs.replace_range(ui..ui + 1, &digits[ud..ud + 1]);
            borrow = false;
        }
        i -= 1;
    }

    if borrow {
        if head == "a" {
            return Ok(Some(format!(
                "Z{}",
                &digits[digits.len() - 1..digits.len()]
            )));
        }
        if head == "A" {
            return Ok(None);
        }
        let h = head.as_bytes()[0] - 1;
        if h < Z_charcode as u8 {
            digs.push_str(&digits[digits.len() - 1..digits.len()]);
        } else {
            digs.pop();
        }
        return Ok(Some(format!("{}{}", h as char, digs)));
    } else {
        return Ok(Some(format!("{}{}", head, digs)));
    }
}

#[cfg(test)]
mod tests {
    extern crate alloc;
    use crate::fractindex;
    use alloc::string::String;

    use super::SMALLEST_INTEGER;
    #[test]
    fn validate_order_key() {
        // too small
        assert_eq!(
            fractindex::validate_order_key(SMALLEST_INTEGER),
            Err("Key is too small")
        );

        // do generation and validation feedback loop tests later
        assert_eq!(fractindex::validate_order_key("a0"), Ok(()));
        assert_eq!(fractindex::validate_order_key("a1"), Ok(()));
        assert_eq!(fractindex::validate_order_key("a2"), Ok(()));
        assert_eq!(fractindex::validate_order_key("Zz"), Ok(()));
        assert_eq!(fractindex::validate_order_key("a1V"), Ok(()));
    }

    #[test]
    fn key_between() {
        fn test(a: Option<&str>, b: Option<&str>, exp: Result<Option<String>, &'static str>) {
            let btwn = fractindex::key_between(a, b, None);
            assert_eq!(btwn, exp);
        }

        test(None, None, Ok(Some(String::from("a0"))));
        test(None, Some("a0"), Ok(Some(String::from("Zz"))));
        test(None, Some("Zz"), Ok(Some(String::from("Zy"))));
        test(Some("a0"), None, Ok(Some(String::from("a1"))));
        test(Some("a1"), None, Ok(Some(String::from("a2"))));
        test(Some("a0"), Some("a1"), Ok(Some(String::from("a0V"))));
        test(Some("a1"), Some("a2"), Ok(Some(String::from("a1V"))));
        test(Some("a0V"), Some("a1"), Ok(Some(String::from("a0l"))));
        test(Some("Zz"), Some("a0"), Ok(Some(String::from("ZzV"))));
        test(Some("Zz"), Some("a1"), Ok(Some(String::from("a0"))));
        test(None, Some("Y00"), Ok(Some(String::from("Xzzz"))));
        test(Some("bzz"), None, Ok(Some(String::from("c000"))));
        test(Some("a0"), Some("a0V"), Ok(Some(String::from("a0G"))));
        test(Some("a0"), Some("a0G"), Ok(Some(String::from("a08"))));
        test(Some("b125"), Some("b129"), Ok(Some(String::from("b127"))));
        test(Some("a0"), Some("a1V"), Ok(Some(String::from("a1"))));
        test(Some("Zz"), Some("a01"), Ok(Some(String::from("a0"))));
        test(None, Some("a0V"), Ok(Some(String::from("a0"))));
        test(None, Some("b999"), Ok(Some(String::from("b99"))));
        test(
            None,
            Some("A00000000000000000000000000"),
            Err("Key is too small"),
        );
        test(
            None,
            Some("A000000000000000000000000001"),
            Ok(Some(String::from("A000000000000000000000000000V"))),
        );
        test(
            Some("zzzzzzzzzzzzzzzzzzzzzzzzzzy"),
            None,
            Ok(Some(String::from("zzzzzzzzzzzzzzzzzzzzzzzzzzz"))),
        );
        test(
            Some("zzzzzzzzzzzzzzzzzzzzzzzzzzz"),
            None,
            Ok(Some(String::from("zzzzzzzzzzzzzzzzzzzzzzzzzzzV"))),
        );
        test(Some("a00"), None, Err("Integer part should not end with 0"));
        test(
            Some("a00"),
            Some("a1"),
            Err("Integer part should not end with 0"),
        );
        test(Some("0"), Some("1"), Err("head is out of range"));
        test(
            Some("a1"),
            Some("a0"),
            Err("key_between - a must be before b"),
        );
    }
}
