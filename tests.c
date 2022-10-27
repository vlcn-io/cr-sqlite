void crsqlUtilTestSuite();
void crsqlTableInfoTestSuite();
void crsqlTestSuite();
void crsqlTriggersTestSuite();
void crsqlChangesVtabReadTestSuite();
void crsqlChangesVtabTestSuite();
void crsqlChangesVtabWriteTestSuite();
void crsqlChangesVtabCommonTestSuite();

int main(int argc, char *argv[])
{
  crsqlUtilTestSuite();
  crsqlTableInfoTestSuite();
  crsqlTestSuite();
  crsqlTriggersTestSuite();
  crsqlChangesVtabTestSuite();
  crsqlChangesVtabReadTestSuite();
  crsqlChangesVtabWriteTestSuite();
  crsqlChangesVtabCommonTestSuite();
}
