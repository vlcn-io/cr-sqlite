source env/bin/activate
python3 -m pip install -r requirements.txt
python -m pytest tests
deactivate

---

saving reqs:
python -m pip freeze > requirements.txt

-e git+ssh://git@github.com/vlcn-io/cr-sqlite.git@26ed5d8adcacbe1624650bc0c3872bdd944747e1#egg=crsql_correctness&subdirectory=py/correctness
