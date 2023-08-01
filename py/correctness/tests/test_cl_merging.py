# - larger cl wins
# - delete is deleted
# - resurrect is resurrected
# - same cl means col versions used
# - cl not moved forward unless there is a delta on merge
# - out of order for cl move up. non sentinel can resurrect or delete
# - app with undo?
# - update prop test to:
#   - prop test with pko table
#   - prop test with many tables
#   - prop test with out-of-order sync
