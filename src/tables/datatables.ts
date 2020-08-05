import { Table, TableRow } from "./table";
import { SurveyModel, Event } from "survey-core";
import { ITableColumn, ColumnVisibility, QuestionLocation } from "./config";
import { DocumentHelper } from "../utils";

import "./datatables.scss";

if (!!document) {
  var svgTemplate = require("html-loader?interpolate!val-loader!../svgbundle.html");
  var templateHolder = document.createElement("div");
  templateHolder.style.display = "none";
  templateHolder.innerHTML = svgTemplate;
  document.head.appendChild(templateHolder);
}

var jQuery = (<any>window)["jQuery"];

interface DataTablesOptions {
  buttons: boolean | string[] | any[] | any;

  dom: string;

  orderFixed: Array<number | string> | Array<Array<number | string>> | object;

  rowGroup: boolean | any;

  headerCallback: any;
}

export class DataTables extends Table {
  public datatableApi: any;

  public currentPageNumber: number = 0;

  /**
   * The event is fired columns configuration has been changed.
   * <br/> sender the datatables adapter
   * <br/> options.survey current survey
   * @see getColumns
   */
  public onColumnsReorder: Event<
    (sender: DataTables, options: any) => any,
    any
  > = new Event<(sender: DataTables, options: any) => any, any>();

  public static initJQuery($: any) {
    jQuery = $;
  }

  constructor(
    survey: SurveyModel,
    data: Array<Object>,
    options: DataTablesOptions,
    _columns: Array<ITableColumn> = [],
    isTrustedAccess = false
  ) {
    super(survey, data, options, _columns, isTrustedAccess);
  }

  destroy() {
    if (!this.renderResult) return;
    const tableNode = this.renderResult.children[0];
    if (jQuery.fn.DataTable.isDataTable(tableNode)) {
      jQuery(tableNode).DataTable().destroy();
    }
    this.datatableApi = undefined;
    super.destroy();
  }

  public setColumnVisibility(columnName: string, visibility: ColumnVisibility) {
    super.setColumnVisibility(columnName, visibility);
    var isInvisible = visibility == ColumnVisibility.Invisible;
    this.datatableApi.column(columnName + ":name").visible(!isInvisible);
  }

  public setColumnLocation(columnName: string, location: QuestionLocation) {
    super.setColumnLocation(columnName, location);
    var column = this.datatableApi.column(columnName + ":name");
    var isColumnLocation = location == QuestionLocation.Column;
    column.visible(isColumnLocation);
  }

  public applyFilter(value: string) {
    this.datatableApi.search(value).draw(false);
  }

  public applyColumnFilter(columnName: string, value: string): void {
    var column = this.datatableApi.column(columnName + ":name");
    if (column.search() !== value) {
      column.search(value).draw(false);
    }
  }

  public sortByColumn(columnName: string, direction: string): void {
    var column = this.datatableApi.column(columnName + ":name");
    column.order(direction).draw(false);
  }

  public setPageSize(value: number): void {
    super.setPageSize(value);
    this.datatableApi.page.len(value).draw(false);
  }

  public setPageNumber(value: number): void {
    super.setPageNumber(value);
    this.datatableApi.page(value).draw(false);
  }

  public getPageNumber(): number {
    return this.datatableApi.page();
  }

  render(targetNode: HTMLElement) {
    var self = this;
    targetNode.className += " sa-table sa-datatables";
    targetNode.innerHTML = "";

    const tableNode = <HTMLTableElement>(
      DocumentHelper.createElement("table", "")
    );
    var columns = this.getColumns();
    var columnsData: any = columns.map((c: any) => c.data);
    const dtButtonClass =
      "sa-table__btn sa-table__btn--small sa-table__btn--gray";
    const options = jQuery.extend(
      true,
      {
        buttons: [
          { extend: "copy", className: dtButtonClass },
          { extend: "csv", className: dtButtonClass },
          { extend: "print", className: dtButtonClass },
        ],
        dom: 'B<"sa-table__header-extensions">prtip',
        // ordering: false,
        data: this.tableData,
        pageLength: 5,
        responsive: false,
        scrollX: true,
        columns: columns,
        colReorder: {
          fixedColumnsLeft: 1,
          realtime: false,
        },
        //orderFixed: [[1, "asc"]],
        language: {
          sSearch: " ",
          searchPlaceholder: "Search...",
          sLengthMenu: "Show _MENU_ entries",
          paginate: {
            previous: " ",
            next: " ",
          },
        },
        select: "api",
        headerCallback: (
          thead: any,
          data: any,
          start: any,
          end: any,
          display: any
        ) => {
          var datatableApi = jQuery(tableNode).dataTable().api();
          var self = this;
          datatableApi
            .columns()
            .eq(0)
            .each((index: number) => {
              var $thNode = jQuery(datatableApi.columns(index).header());
              $thNode.unbind("click.DT");
              if (!!columnsData[index] && $thNode.has("button").length === 0) {
                var container = DocumentHelper.createElement(
                  "div",
                  "sa-table__action-container"
                );
                self.extensions.render(container, "column", {
                  columnName: columnsData[index],
                });
              }
              $thNode.prepend(container);
            });
        },
      },
      this.options
    );

    targetNode.appendChild(tableNode);
    tableNode.width = "100%";
    tableNode.className = "sa-datatables__table display responsive dataTable";

    const datatableApiRef = (this.datatableApi = jQuery(tableNode).DataTable(
      options
    ));
    var extensionsContainer = jQuery("div.sa-table__header-extensions")[0];

    // this.onTableToolsCreated.fire(this, { extensions: extensions });
    this.extensions.render(extensionsContainer, "header");

    datatableApiRef.page(self.currentPageNumber);
    this.datatableApi.rowGroup().enable(false).draw(false);

    datatableApiRef.on(
      "column-reorder",
      (e: any, settings: any, details: any) => {
        this.moveColumn(details.from - 1, details.to - 1);
        this.onColumnsReorder.fire(this, { columns: this.columns });
      }
    );
    datatableApiRef
      .rows()
      .eq(0)
      .each((index: number) => {
        var row = datatableApiRef.row(index);
        var detailsTr = DocumentHelper.createElement("tr");
        var detailsTd = <HTMLTableDataCellElement>(
          DocumentHelper.createElement("td", "sa-datatables__details-container")
        );
        detailsTr.appendChild(detailsTd);
        var rowElement = row.node();
        var firstCell = row.cell(row.index(), 0).node();
        var tableRow = new DatatablesRow(this, firstCell, detailsTd, row);
        tableRow.onToggleDetails.add((sender: TableRow, options: any) => {
          if (options.isExpanded) {
            detailsTd.colSpan = rowElement.childElementCount;
            rowElement.parentNode.insertBefore(
              detailsTr,
              rowElement.nextSibling
            );
          } else {
            detailsTr.remove();
          }
        });
        this._rows.push(tableRow);
        tableRow.render();
      });
    datatableApiRef.draw(false);
    this.renderResult = targetNode;
  }

  public doStateSave() {
    this.datatableApi.state.save();
  }
  public stateSaveCallback(settings: any, data: any) {}

  public detailButtonCreators: Array<(columnName?: string) => HTMLElement> = [];

  getColumns(): Array<Object> {
    const columns: any = this.getAvailableColumns().map((column) => {
      var question = this.survey.getQuestionByName(column.name);
      return {
        name: column.name,
        data: column.name,
        sTitle: (question && question.title) || column.displayName,
        visible: this.isColumnVisible(column),
        orderable: false,
        mRender: (_data: object, _type: string, row: any) => {
          var value = row[column.name];
          return typeof value === "string"
            ? jQuery("<div>").text(value).html()
            : JSON.stringify(value);
        },
      };
    });

    return [
      {
        orderable: false,
        data: null,
        defaultContent: "",
      },
    ].concat(columns);
  }

  public layout() {
    !!this.datatableApi && this.datatableApi.columns.adjust();
  }
}

export class DatatablesRow extends TableRow {
  constructor(
    protected table: Table,
    protected extensionsContainer: HTMLElement,
    protected detailsContainer: HTMLElement,
    private _innerRow: any
  ) {
    super(table, extensionsContainer, detailsContainer);
    this.rowElement = _innerRow.node();
    this.rowData = _innerRow.data();
    this._innerRow = this._innerRow.row(this.rowElement);
    (<DataTables>table).onColumnsReorder.add(() => {
      this.render();
    });
  }
  private rowElement: HTMLElement;
  private rowData: any;

  public get innerRow() {
    return this._innerRow.row(this.rowElement);
  }

  public getElement(): HTMLElement {
    return this.rowElement;
  }

  public getData(): HTMLElement {
    return this.rowData;
  }

  public getDataPosition(): number {
    return this.innerRow.index();
  }

  public remove(): void {
    this.innerRow.remove().draw();
    super.remove();
  }
}
